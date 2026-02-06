import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const checks: Record<string, unknown> = {};

  // 1. Check DB connection
  try {
    const connResult = await pool.query("SELECT NOW() AS time");
    checks.dbConnection = {
      ok: true,
      serverTime: connResult.rows[0].time,
    };
  } catch (error) {
    checks.dbConnection = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return NextResponse.json(checks, { status: 500 });
  }

  // 2. Check if public.users table exists
  try {
    const tableResult = await pool.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_name = 'users'`
    );
    checks.usersTable = {
      ok: tableResult.rows.length > 0,
      schemas: tableResult.rows.map(
        (r: { table_schema: string; table_name: string }) =>
          `${r.table_schema}.${r.table_name}`
      ),
    };
  } catch (error) {
    checks.usersTable = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // 3. Check user count in public.users
  try {
    const countResult = await pool.query(
      "SELECT COUNT(*) AS count FROM public.users"
    );
    checks.userCount = {
      ok: true,
      count: parseInt(countResult.rows[0].count, 10),
    };
  } catch (error) {
    checks.userCount = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // 4. Check if specific user exists (without exposing password)
  try {
    const userResult = await pool.query(
      "SELECT id, email, first_name, last_name, created_at FROM public.users WHERE email = $1",
      ["info@mdap.io"]
    );
    checks.testUser = {
      ok: userResult.rows.length > 0,
      found: userResult.rows.length > 0,
      user: userResult.rows[0] || null,
    };
  } catch (error) {
    checks.testUser = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // 5. Check search_path
  try {
    const pathResult = await pool.query("SHOW search_path");
    checks.searchPath = {
      ok: true,
      value: pathResult.rows[0].search_path,
    };
  } catch (error) {
    checks.searchPath = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // 6. Check if password_hash column exists
  try {
    const colResult = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    checks.usersColumns = {
      ok: colResult.rows.length > 0,
      columns: colResult.rows.map(
        (r: { column_name: string; data_type: string }) =>
          `${r.column_name} (${r.data_type})`
      ),
    };
  } catch (error) {
    checks.usersColumns = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const allOk = Object.values(checks).every(
    (c) => (c as { ok: boolean }).ok
  );

  return NextResponse.json(checks, { status: allOk ? 200 : 500 });
}
