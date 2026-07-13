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
      "SELECT id, email, first_name, last_name, password_hash, role, email_verified, created_at FROM public.users WHERE email = $1",
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

    // Unverified accounts get a 7-day grace period, then are deactivated
    // until the email is confirmed (see /verify-email to resend the link)
    const GRACE_DAYS = 7;
    if (user.email_verified === false) {
      const createdAt = new Date(user.created_at).getTime();
      if (Date.now() - createdAt > GRACE_DAYS * 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          {
            error:
              "Your account is deactivated because the email was never confirmed. Verify it to reactivate.",
            needsVerification: true,
          },
          { status: 403 }
        );
      }
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role || "user",
      // Derived from the role ladder (legacy can_manage is superseded)
      canManage: user.role === "admin" || user.role === "management",
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
