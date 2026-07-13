import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken, createSessionCookie } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  try {
    const { email, password, turnstileToken } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Anti-bot / brute-force friction (no-op when keys are unset in dev)
    const turnstileOk = await verifyTurnstile(turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json(
        { error: "Verification failed — please try again" },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await pool.query(
        "SELECT id, email, first_name, last_name, password_hash, role, email_verified, created_at, email_changed_at FROM public.users WHERE email = $1",
        [email.toLowerCase()]
      );
    } catch (err) {
      // 42703 = email_changed_at not migrated yet (deploy landed before
      // /api/setup ran) — login must keep working in that window
      if ((err as { code?: string }).code !== "42703") throw err;
      result = await pool.query(
        "SELECT id, email, first_name, last_name, password_hash, role, email_verified, created_at FROM public.users WHERE email = $1",
        [email.toLowerCase()]
      );
    }

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
    // until the email is confirmed (see /verify-email to resend the link).
    // A self-service email change (/api/account/email) restarts the clock
    // at email_changed_at — the new address gets its own 7 days.
    const GRACE_DAYS = 7;
    if (user.email_verified === false) {
      const graceStart = new Date(user.email_changed_at || user.created_at).getTime();
      if (Date.now() - graceStart > GRACE_DAYS * 24 * 60 * 60 * 1000) {
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
