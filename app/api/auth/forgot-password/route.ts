import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import pool from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  try {
    const { email, turnstileToken } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const turnstileOk = await verifyTurnstile(turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json(
        { error: "Verification failed — please try again" },
        { status: 400 }
      );
    }

    // Always respond identically whether or not the account exists,
    // so this endpoint can't be used to enumerate registered emails.
    const genericResponse = NextResponse.json({
      message:
        "If an account exists for that email, a reset link has been sent.",
    });

    const result = await pool.query(
      "SELECT id, first_name FROM public.users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];
    if (!user) return genericResponse;

    // Token: random value emailed to the user; only its hash is stored
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    await pool.query(
      `INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, tokenHash]
    );

    const origin = new URL(request.url).origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Don't leak email-sending failures to the response either
    sendPasswordResetEmail(email.toLowerCase().trim(), user.first_name, resetUrl).catch(
      (e) => console.error("Reset email failed:", e)
    );

    return genericResponse;
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
