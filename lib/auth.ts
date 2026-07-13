import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

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

// The JWT keeps the role from login time; permission checks read the DB so
// an admin's role change takes effect immediately (no re-login needed).
// Falls back to the JWT role if the DB is unreachable.
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
