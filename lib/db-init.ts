import pool from "./db";
import { getUserFolder } from "./b2";

// Per-user B2 folder. The folder used to be re-derived from first/last name
// on every request — names are NOT unique, so registering with an existing
// user's name landed in (and fully controlled) their folder. The folder is
// now allocated once and stored in users.b2_folder.
// Backfill uses the EXACT same derivation as the old code, so existing
// folders keep resolving — no B2 object is moved or renamed (AzuraCast
// playlists reference those paths).
export async function migrateB2Folder() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS b2_folder VARCHAR(255);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_b2_folder
      ON public.users(b2_folder);
    `);

    const existing = await client.query(
      "SELECT b2_folder FROM public.users WHERE b2_folder IS NOT NULL"
    );
    const taken = new Set<string>(existing.rows.map((r) => r.b2_folder));

    // Oldest first: on a pre-existing name collision the older account keeps
    // the canonical folder (its uploads most plausibly seeded it).
    const pending = await client.query(
      `SELECT id, first_name, last_name FROM public.users
       WHERE b2_folder IS NULL
       ORDER BY created_at ASC, id ASC`
    );

    for (const row of pending.rows) {
      let folder = getUserFolder(row.first_name, row.last_name);
      if (taken.has(folder)) {
        // Deterministic suffix from the (unique) user id → re-runs converge.
        const id = String(row.id).replace(/-/g, "");
        let len = 4;
        let candidate = `${folder}-${id.slice(0, len)}`;
        while (taken.has(candidate) && len < id.length) {
          len += 2;
          candidate = `${folder}-${id.slice(0, len)}`;
        }
        console.warn(
          `⚠ b2_folder collision for user ${row.id} (${folder}) — assigning ${candidate}. ` +
            `Files already in the shared folder remain with the older account (manual triage).`
        );
        folder = candidate;
      }
      await client.query(
        "UPDATE public.users SET b2_folder = $1 WHERE id = $2",
        [folder, row.id]
      );
      taken.add(folder);
    }

    if (pending.rows.length > 0) {
      console.log(`✓ b2_folder backfilled for ${pending.rows.length} user(s)`);
    }
    console.log("✓ b2_folder migration complete");
  } finally {
    client.release();
  }
}

// Audit trail for the management Logs tab: who did what, when. user_name is
// denormalized so history survives user deletion (user_id then goes NULL).
export async function migrateActivityLog() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
        user_name VARCHAR(200) NOT NULL,
        action VARCHAR(100) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_created
      ON public.activity_log(created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_action
      ON public.activity_log(action);
    `);
    console.log("✓ activity_log migration complete");
  } finally {
    client.release();
  }
}

export async function migrateAddRoleColumn() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
    `);

    await client.query(`
      UPDATE public.users
      SET role = 'admin'
      WHERE email = 'info@mdap.io' AND (role IS NULL OR role != 'admin');
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
    `);

    console.log("✓ Role column migration complete");
  } finally {
    client.release();
  }
}

export async function migrateAddCanManageColumn() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS can_manage BOOLEAN DEFAULT false;
    `);

    await client.query(`
      UPDATE public.users
      SET can_manage = true
      WHERE email = 'info@mdap.io';
    `);

    console.log("✓ can_manage column migration complete");
  } finally {
    client.release();
  }
}

export async function migrateCreateManagementSessions() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.management_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        user_name VARCHAR(200) NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true,
        kicked_by_user_id UUID,
        kicked_by_user_name VARCHAR(200)
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_management_active_session
      ON public.management_sessions(is_active) WHERE is_active = true;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_management_sessions_user
      ON public.management_sessions(user_id);
    `);

    console.log("✓ management_sessions table migration complete");
  } finally {
    client.release();
  }
}

export async function migrateCreatePasswordResetTokens() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash
      ON public.password_reset_tokens(token_hash);
    `);

    console.log("✓ password_reset_tokens table migration complete");
  } finally {
    client.release();
  }
}

// One-time role overhaul: user/admin + can_manage → 4-tier role ladder
// (user → uploader → management → admin). Uses a migration log so the
// grandfathering runs exactly once even though /api/setup is re-run.
export async function migrateRolesOverhaul() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.migration_log (
        name TEXT PRIMARY KEY,
        ran_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    const already = await client.query(
      "SELECT name FROM public.migration_log WHERE name = 'roles_overhaul'"
    );
    if (already.rows.length > 0) return;

    // can_manage users become 'management' (admins stay admin)
    await client.query(`
      UPDATE public.users SET role = 'management'
      WHERE can_manage = true AND role != 'admin';
    `);

    // Pre-existing plain users keep their upload capability
    await client.query(`
      UPDATE public.users SET role = 'uploader'
      WHERE role = 'user';
    `);

    await client.query(
      "INSERT INTO public.migration_log (name) VALUES ('roles_overhaul')"
    );
    console.log("✓ roles overhaul migration complete (existing users → uploader/management)");
  } finally {
    client.release();
  }
}

export async function migrateEmailVerification() {
  const client = await pool.connect();
  try {
    // Detect whether the column already exists BEFORE adding it, so the
    // grandfathering (mark pre-existing users as verified) runs exactly once
    const existing = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'email_verified'
    `);
    const isFirstRun = existing.rows.length === 0;

    await client.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;
    `);

    if (isFirstRun) {
      // Accounts created before this feature keep working without verification
      await client.query(`
        UPDATE public.users
        SET email_verified = true, email_verified_at = NOW()
        WHERE email_verified = false;
      `);
      console.log("✓ Existing users grandfathered as verified");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_verify_tokens_hash
      ON public.email_verification_tokens(token_hash);
    `);

    console.log("✓ email verification migration complete");
  } finally {
    client.release();
  }
}

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // NOTE: the legacy `files` table is no longer created — file listings
    // come from B2 (`listUserItems`) and metadata lives in `items`. The
    // existing table in the shared DB is left untouched.

    // Items table — stores upload metadata (mirrors metadata.json in B2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        folder VARCHAR(500) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        mediatype VARCHAR(100),
        creator VARCHAR(500),
        date VARCHAR(50),
        subject TEXT,
        language VARCHAR(10),
        ia_identifier VARCHAR(500),
        ia_url VARCHAR(1000),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_items_user_id ON public.items(user_id);
    `);

    // Unique constraint: one folder per user
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_user_folder ON public.items(user_id, folder);
    `);
  } finally {
    client.release();
  }
}
