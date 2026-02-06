import pool from "./db";

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        file_key VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
    `);

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
