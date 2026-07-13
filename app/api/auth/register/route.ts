import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "@/lib/db";
import { signToken, createSessionCookie, hashToken } from "@/lib/auth";
import { createUserFolder } from "@/lib/b2";
import { allocateB2Folder } from "@/lib/user-folder";
import { sendVerificationEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { getAppUrl } from "@/lib/app-url";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: NextRequest) {
  try {
    const { email, firstName, lastName, password, turnstileToken } = await request.json();

    if (!email || !firstName || !lastName || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const turnstileOk = await verifyTurnstile(turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json(
        { error: "Verification failed — please try again" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const existingUser = await pool.query(
      "SELECT id FROM public.users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Unique per-user B2 folder (name-derived, suffixed on collision) —
    // stored once; never recomputed from the (non-unique) name again.
    let b2Folder = await allocateB2Folder(firstName, lastName);
    const insertUser = (folder: string) =>
      pool.query(
        `INSERT INTO public.users (email, first_name, last_name, password_hash, role, b2_folder)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, first_name, last_name, role`,
        [email.toLowerCase(), firstName, lastName, passwordHash, "user", folder]
      );

    let result;
    try {
      result = await insertUser(b2Folder);
    } catch (e) {
      const err = e as { code?: string; constraint?: string };
      // Same-name allocation race: re-allocate (now suffixed) and retry once
      if (err.code === "23505" && err.constraint === "idx_users_b2_folder") {
        b2Folder = await allocateB2Folder(firstName, lastName);
        result = await insertUser(b2Folder);
      } else {
        throw e;
      }
    }

    const user = result.rows[0];

    // Create user folder in Backblaze B2
    await createUserFolder(b2Folder);

    await logActivity(
      { userId: user.id, userName: `${firstName} ${lastName}`.trim() },
      "auth.register",
      "Created an account"
    );

    // Welcome + email verification link — fire and forget, never blocks
    // the registration. Unverified accounts deactivate after 7 days, and
    // the token lives just as long (matches the email copy).
    const appUrl = getAppUrl(request);
    (async () => {
      const verifyToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(verifyToken);
      await pool.query(
        `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [user.id, tokenHash]
      );
      await sendVerificationEmail(
        user.email,
        user.first_name,
        `${appUrl}/verify-email?token=${verifyToken}`,
        true
      );
    })().catch((e) => console.error("Verification email failed:", e));

    const token = signToken({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role || "user",
      canManage: false,
    });

    const cookie = createSessionCookie(token);
    const response = NextResponse.json({
      message: "Registration successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });

    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
