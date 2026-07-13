import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "@/lib/db";
import {
  requireRole,
  signToken,
  createSessionCookie,
  canManageRadio,
  hashToken,
} from "@/lib/auth";
import { sendVerificationEmail, sendEmailChangedNotice } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { logActivity, actorFromSession } from "@/lib/activity-log";

// Self-service email change (password-confirmed). The new address must be
// re-verified: email_verified flips false and the 7-day deactivation clock
// restarts at email_changed_at (the login grace check anchors there). A
// verification link goes to the NEW inbox; the OLD one gets a security
// notice — both via Resend.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("authenticated");
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const newEmail = String(body.newEmail ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!newEmail || !password) {
      return NextResponse.json(
        { error: "New email and current password are required" },
        { status: 400 }
      );
    }
    if (newEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "Enter a valid email address" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      "SELECT email, first_name, last_name, password_hash FROM public.users WHERE id = $1",
      [auth.session.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    if (newEmail === user.email) {
      return NextResponse.json(
        { error: "That is already your email address" },
        { status: 400 }
      );
    }

    const taken = await pool.query(
      "SELECT id FROM public.users WHERE email = $1 AND id != $2",
      [newEmail, auth.session.userId]
    );
    if (taken.rows.length > 0) {
      return NextResponse.json(
        { error: "That email is already registered" },
        { status: 409 }
      );
    }

    try {
      await pool.query(
        `UPDATE public.users
         SET email = $1, email_verified = false, email_verified_at = NULL,
             email_changed_at = NOW()
         WHERE id = $2`,
        [newEmail, auth.session.userId]
      );
    } catch (err) {
      // 42703 = email_changed_at missing (deploy landed before /api/setup).
      // Refusing beats silently anchoring the deactivation clock on
      // created_at, which would lock older accounts out at next login.
      if ((err as { code?: string }).code === "42703") {
        return NextResponse.json(
          { error: "Database migration pending — an admin must open /api/setup first" },
          { status: 503 }
        );
      }
      throw err;
    }

    // Links sent to the previous address must not verify the new one
    await pool.query(
      "UPDATE public.email_verification_tokens SET used = true WHERE user_id = $1 AND used = false",
      [auth.session.userId]
    );

    const verifyToken = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [auth.session.userId, hashToken(verifyToken)]
    );

    const appUrl = getAppUrl(request);
    await sendVerificationEmail(
      newEmail,
      user.first_name,
      `${appUrl}/verify-email?token=${verifyToken}`,
      false
    );
    await sendEmailChangedNotice(user.email, user.first_name, newEmail);

    await logActivity(
      actorFromSession(auth.session),
      "auth.email_change",
      `Changed account email ${user.email} → ${newEmail}`
    );

    // Fresh JWT — the cookie carries the email identity claim
    const token = signToken({
      userId: auth.session.userId,
      email: newEmail,
      firstName: user.first_name,
      lastName: user.last_name,
      role: auth.role,
      canManage: canManageRadio(auth.role),
    });
    const cookie = createSessionCookie(token);
    const response = NextResponse.json({
      message:
        "Email updated — check the new inbox and confirm it within 7 days",
      user: { email: newEmail, emailVerified: false },
    });
    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    console.error("Account email change error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
