import { NextRequest, NextResponse } from "next/server";
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
    const { canManage } = await request.json();

    if (typeof canManage !== "boolean") {
      return NextResponse.json(
        { error: "canManage must be a boolean" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE public.users SET can_manage = $1 WHERE id = $2 RETURNING id, email, can_manage`,
      [canManage, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Management access updated",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Admin toggle management error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
