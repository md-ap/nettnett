import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import pool from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
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

    // Identical response whether or not the account exists (anti-enumeration)
    const genericResponse = NextResponse.json({
      message:
        "If an unverified account exists for that email, a confirmation link has been sent.",
    });

    const result = await pool.query(
      "SELECT id, first_name, email_verified FROM public.users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];
    if (!user || user.email_verified) return genericResponse;

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    await pool.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '48 hours')`,
      [user.id, tokenHash]
    );

    const origin = new URL(request.url).origin;
    sendVerificationEmail(
      email.toLowerCase().trim(),
      user.first_name,
      `${origin}/verify-email?token=${token}`,
      false
    ).catch((e) => console.error("Resend verification email failed:", e));

    return genericResponse;
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
