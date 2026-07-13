import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { requireRole, isAdmin, canManageRadio } from "@/lib/auth";
import { createUserFolder } from "@/lib/b2";
import { allocateB2Folder } from "@/lib/user-folder";
import { logActivity, actorFromSession } from "@/lib/activity-log";

export async function GET() {
  try {
    const auth = await requireRole(isAdmin);
    if (auth instanceof NextResponse) return auth;

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, email_verified, created_at
       FROM public.users
       ORDER BY created_at DESC`
    );

    const users = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role || "user",
      canManage: canManageRadio(row.role || "user"),
      verified: row.email_verified === true,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Admin users list error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(isAdmin);
    if (auth instanceof NextResponse) return auth;

    const { email, firstName, lastName, password, role } = await request.json();

    if (!email || !firstName || !lastName || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const newRole = role || "uploader";
    if (!["user", "uploader", "management", "admin"].includes(newRole)) {
      return NextResponse.json(
        { error: "Role must be one of: user, uploader, management, admin" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      "SELECT id FROM public.users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Admin-created accounts are trusted: mark them email-verified
    let b2Folder = await allocateB2Folder(firstName, lastName);
    const insertUser = (folder: string) =>
      pool.query(
        `INSERT INTO public.users (email, first_name, last_name, password_hash, role, email_verified, email_verified_at, b2_folder)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), $6)
         RETURNING id, email, first_name, last_name, role, created_at`,
        [email.toLowerCase(), firstName, lastName, passwordHash, newRole, folder]
      );

    let result;
    try {
      result = await insertUser(b2Folder);
    } catch (e) {
      const err = e as { code?: string; constraint?: string };
      // Same-name allocation race: re-allocate (now suffixed) and retry once
      if (err.code === "23505" && err.constraint === "idx_users_b2_folder") {
        b2Folder = await allocateB2Folder(firstName, lastName);
        result = await insertUser(b2Folder);
      } else {
        throw e;
      }
    }

    // Create B2 folder for new user
    try {
      await createUserFolder(b2Folder);
    } catch (b2Error) {
      console.error("B2 folder creation failed (user still created):", b2Error);
    }

    const user = result.rows[0];

    await logActivity(
      actorFromSession(auth.session),
      "admin.user_create",
      `Created user ${user.email} (role ${user.role})`
    );

    return NextResponse.json({
      message: "User created successfully",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error("Admin create user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
