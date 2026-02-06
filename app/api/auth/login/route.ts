import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken, createSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      "SELECT id, email, first_name, last_name, password_hash FROM public.users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    });

    const cookie = createSessionCookie(token);
    const response = NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });

    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error("Login error:", {
      message: err.message,
      code: err.code,
      name: err.name,
      connectionString: process.env.DATABASE_URL ? "DATABASE_URL set" : process.env.NILEDB_POSTGRES_URL ? "NILEDB_POSTGRES_URL set" : process.env.POSTGRES_URL ? "POSTGRES_URL set" : "NO DB URL FOUND",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
