import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import {
  requireRole,
  signToken,
  createSessionCookie,
  canManageRadio,
} from "@/lib/auth";
import { logActivity, actorFromSession } from "@/lib/activity-log";
import { sendAccountDeletedNotice } from "@/lib/email";

// Self-service account settings (/account) — reachable by EVERY logged-in
// role, including plain "user". Read the profile, rename, delete the
// account. Email/password changes live in ./email and ./password.

export async function GET() {
  try {
    const auth = await requireRole("authenticated");
    if (auth instanceof NextResponse) return auth;

    const result = await pool.query(
      `SELECT email, first_name, last_name, role, email_verified, created_at
       FROM public.users WHERE id = $1`,
      [auth.session.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role || "user",
        emailVerified: user.email_verified === true,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error("Account GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — update first/last name. The JWT carries the name (navbar, audit
// actor), so a fresh cookie is issued with the new identity claims.
// users.b2_folder was allocated at registration and stays put — a rename
// never re-derives or moves the B2 folder.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole("authenticated");
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First and last name are required" },
        { status: 400 }
      );
    }
    if (firstName.length > 100 || lastName.length > 100) {
      return NextResponse.json(
        { error: "Names must be 100 characters or fewer" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE public.users SET first_name = $1, last_name = $2
       WHERE id = $3
       RETURNING email, first_name, last_name`,
      [firstName, lastName, auth.session.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const oldName = `${auth.session.firstName} ${auth.session.lastName}`.trim();
    const newName = `${firstName} ${lastName}`.trim();
    await logActivity(
      { userId: auth.session.userId, userName: newName },
      "auth.profile_update",
      oldName === newName ? "Updated their profile" : `Renamed account ${oldName} → ${newName}`
    );

    const token = signToken({
      userId: auth.session.userId,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: auth.role,
      canManage: canManageRadio(auth.role),
    });
    const cookie = createSessionCookie(token);
    const response = NextResponse.json({
      message: "Profile updated",
      user: {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    console.error("Account PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — self-service account deletion, password-confirmed. DB rows
// cascade (items, sessions, tokens; activity_log keeps the entry with the
// name, user_id → NULL). Files already uploaded to B2 are NOT touched —
// they may be part of the radio media library and scheduled playlists.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireRole("authenticated");
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const password = String(body.password ?? "");
    if (!password) {
      return NextResponse.json(
        { error: "Password confirmation is required" },
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

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    // Same guard as the admin panel — the super admin account stays
    if (user.email === "info@mdap.io") {
      return NextResponse.json(
        { error: "The super admin account cannot be deleted" },
        { status: 400 }
      );
    }

    // Never delete the last admin — the platform would be unmanageable
    if (auth.role === "admin") {
      const others = await pool.query(
        "SELECT COUNT(*)::int AS n FROM public.users WHERE role = 'admin' AND id != $1",
        [auth.session.userId]
      );
      if ((others.rows[0]?.n ?? 0) === 0) {
        return NextResponse.json(
          { error: "You are the only admin — promote another admin before deleting this account" },
          { status: 400 }
        );
      }
    }

    // Log BEFORE the delete: the FK sets user_id NULL but keeps the entry
    await logActivity(
      actorFromSession(auth.session),
      "auth.account_delete",
      `Deleted their own account (${user.email})`
    );

    await pool.query("DELETE FROM public.users WHERE id = $1", [
      auth.session.userId,
    ]);

    await sendAccountDeletedNotice(user.email, user.first_name);

    // Clear the session cookie (same recipe as /api/auth/logout)
    const response = NextResponse.json({ message: "Account deleted" });
    response.cookies.set("nettnett_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Account DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
