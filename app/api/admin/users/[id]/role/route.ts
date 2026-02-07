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
    const { role } = await request.json();

    if (!role || !["admin", "user"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'admin' or 'user'" },
        { status: 400 }
      );
    }

    // Prevent removing your own admin role
    if (userId === session.userId && role !== "admin") {
      return NextResponse.json(
        { error: "Cannot remove your own admin privileges" },
        { status: 400 }
      );
    }

    // Protect super admin (info@mdap.io) — always admin
    const userCheck = await pool.query(
      "SELECT email FROM public.users WHERE id = $1",
      [userId]
    );
    if (userCheck.rows.length > 0 && userCheck.rows[0].email === "info@mdap.io" && role !== "admin") {
      return NextResponse.json(
        { error: "Cannot remove admin from the super admin account" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE public.users SET role = $1 WHERE id = $2 RETURNING id, email, role`,
      [role, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Role updated successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Admin change role error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
