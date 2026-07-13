import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { sendPasswordChangedNotice } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { logActivity, actorFromSession } from "@/lib/activity-log";

// Self-service password change (current password required). Outstanding
// reset links die with the old password; a security notice goes out via
// Resend. The session cookie stays valid — it carries no password material.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("authenticated");
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new password are required" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      "SELECT email, first_name, password_hash FROM public.users WHERE id = $1",
      [auth.session.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Incorrect current password" },
        { status: 403 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE public.users SET password_hash = $1 WHERE id = $2",
      [passwordHash, auth.session.userId]
    );

    // Any pending forgot-password links predate this change — burn them
    await pool.query(
      "UPDATE public.password_reset_tokens SET used = true WHERE user_id = $1 AND used = false",
      [auth.session.userId]
    );

    await sendPasswordChangedNotice(
      user.email,
      user.first_name,
      `${getAppUrl(request)}/forgot-password`
    );

    await logActivity(
      actorFromSession(auth.session),
      "auth.password_change",
      "Changed their password"
    );

    return NextResponse.json({ message: "Password updated" });
  } catch (error) {
    console.error("Account password change error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
