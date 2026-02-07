import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createUserFolder } from "@/lib/b2";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, can_manage, created_at
       FROM public.users
       ORDER BY created_at DESC`
    );

    const users = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role || "user",
      canManage: row.can_manage || false,
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
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, firstName, lastName, password } = await request.json();

    if (!email || !firstName || !lastName || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
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

    const result = await pool.query(
      `INSERT INTO public.users (email, first_name, last_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email.toLowerCase(), firstName, lastName, passwordHash, "user"]
    );

    // Create B2 folder for new user
    try {
      await createUserFolder(firstName, lastName);
    } catch (b2Error) {
      console.error("B2 folder creation failed (user still created):", b2Error);
    }

    const user = result.rows[0];

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
