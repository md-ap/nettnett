import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET!;
const COOKIE_NAME = "nettnett_session";

export interface JWTPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  canManage: boolean;
}

// Role ladder: user (no permissions, must request access) → uploader
// (can upload files) → management (upload + radio management) → admin (all).
// The legacy can_manage column is superseded by the "management" role.
export const ROLES = ["user", "uploader", "management", "admin"] as const;

export function canUpload(role: string | undefined): boolean {
  return role === "uploader" || role === "management" || role === "admin";
}

export function canManageRadio(role: string | undefined): boolean {
  return role === "management" || role === "admin";
}

export const isAdmin = (role: string | undefined) => role === "admin";

// DISPLAY-ONLY fresh role (falls back to the JWT role if the DB is
// unreachable, so the UI doesn't flap on a DB blip). API authorization
// must use requireRole below, which fails closed instead.
export async function getDbRole(userId: string, fallback: string): Promise<string> {
  try {
    const { default: pool } = await import("./db");
    const result = await pool.query(
      "SELECT role FROM public.users WHERE id = $1",
      [userId]
    );
    return result.rows[0]?.role || fallback;
  } catch {
    return fallback;
  }
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JWTPayload;
  } catch {
    return null;
  }
}

// SHA-256 hex digest used to store one-time tokens (password reset,
// email verification) — only the hash ever touches the database.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export interface AuthContext {
  session: JWTPayload; // JWT identity claims (userId/email/names) — role claim is ignored
  role: string; // FRESH from public.users, never the JWT snapshot
  b2Folder: string; // canonical users.b2_folder (legacy derivation as fallback)
}

// Authenticate + authorize an API request against the FRESH role in the DB.
// Fail-closed: a DB error yields 503 instead of trusting stale JWT claims;
// a deleted user with a still-valid JWT gets 401.
// Usage: const auth = await requireRole(canUpload);
//        if (auth instanceof NextResponse) return auth;
export async function requireRole(
  predicate: ((role: string) => boolean) | "authenticated",
  opts?: { forbiddenMessage?: string }
): Promise<AuthContext | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let row: { role: string | null; b2_folder: string | null } | undefined;
  try {
    const { default: pool } = await import("./db");
    const result = await pool.query(
      "SELECT role, b2_folder FROM public.users WHERE id = $1",
      [session.userId]
    );
    row = result.rows[0];
  } catch (err) {
    console.error("requireRole: DB lookup failed:", err);
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  if (!row) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = row.role || "user";
  if (predicate !== "authenticated" && !predicate(role)) {
    return NextResponse.json(
      { error: opts?.forbiddenMessage ?? "Forbidden" },
      { status: 403 }
    );
  }

  let b2Folder = row.b2_folder;
  if (!b2Folder) {
    // Users created before the b2_folder backfill (or during a deploy gap)
    // fall back to the legacy name derivation until the next /api/setup run.
    const { getUserFolder } = await import("./b2");
    b2Folder = getUserFolder(session.firstName, session.lastName);
    console.warn(
      `requireRole: user ${session.userId} has no b2_folder — using legacy derivation`
    );
  }

  return { session, role, b2Folder };
}

export function createSessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
