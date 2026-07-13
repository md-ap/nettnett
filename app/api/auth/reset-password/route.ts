import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid reset link" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const result = await pool.query(
      `SELECT t.id, t.user_id
       FROM public.password_reset_tokens t
       WHERE t.token_hash = $1
         AND t.used = false
         AND t.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const resetToken = result.rows[0];

    if (!resetToken) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired — request a new one" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query("UPDATE public.users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      resetToken.user_id,
    ]);
    await pool.query(
      "UPDATE public.password_reset_tokens SET used = true WHERE user_id = $1",
      [resetToken.user_id]
    );

    return NextResponse.json({ message: "Password updated — you can now sign in" });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
