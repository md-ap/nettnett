import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { hashToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid verification link" }, { status: 400 });
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
      `SELECT t.id, t.user_id
       FROM public.email_verification_tokens t
       WHERE t.token_hash = $1
         AND t.used = false
         AND t.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const verifyToken = result.rows[0];

    if (!verifyToken) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired — request a new one" },
        { status: 400 }
      );
    }

    await pool.query(
      `UPDATE public.users
       SET email_verified = true, email_verified_at = NOW()
       WHERE id = $1`,
      [verifyToken.user_id]
    );
    await pool.query(
      "UPDATE public.email_verification_tokens SET used = true WHERE user_id = $1",
      [verifyToken.user_id]
    );

    return NextResponse.json({ message: "Email verified — your account is fully active" });
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
