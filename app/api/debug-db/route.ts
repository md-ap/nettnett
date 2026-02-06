import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const dbVars = Object.keys(process.env).filter(
    (k) =>
      k.includes("DB") ||
      k.includes("POSTGRES") ||
      k.includes("NILE") ||
      k.includes("DATABASE")
  );

  const connUsed = process.env.DATABASE_URL
    ? "DATABASE_URL"
    : process.env.NILEDB_POSTGRES_URL
      ? "NILEDB_POSTGRES_URL"
      : process.env.POSTGRES_URL
        ? "POSTGRES_URL"
        : "NONE";

  // Mask the connection string (show host only)
  const raw =
    process.env.DATABASE_URL ||
    process.env.NILEDB_POSTGRES_URL ||
    process.env.POSTGRES_URL ||
    "";
  let host = "unknown";
  try {
    const url = new URL(raw);
    host = url.hostname;
  } catch {
    host = "invalid-url: " + raw.substring(0, 30) + "...";
  }

  // Test actual DB connection
  let dbStatus = "untested";
  let dbError = "";
  let userCount = -1;
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM public.users");
    userCount = parseInt(result.rows[0].count);
    dbStatus = "connected";
  } catch (error: unknown) {
    dbStatus = "failed";
    const err = error as Error & { code?: string };
    dbError = `${err.name}: ${err.message} (code: ${err.code || "none"})`;
  }

  return NextResponse.json({
    envVarsFound: dbVars,
    connectionVarUsed: connUsed,
    dbHost: host,
    dbStatus,
    dbError: dbError || undefined,
    userCount: userCount >= 0 ? userCount : undefined,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
