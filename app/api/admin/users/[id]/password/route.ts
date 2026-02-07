import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await params;
    const { newPassword } = await request.json();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const result = await pool.query(
      `UPDATE public.users SET password_hash = $1 WHERE id = $2 RETURNING id, email`,
      [passwordHash, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Admin edit password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
