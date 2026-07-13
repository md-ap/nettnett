import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireRole, isAdmin } from "@/lib/auth";
import { logActivity, actorFromSession } from "@/lib/activity-log";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(isAdmin);
    if (auth instanceof NextResponse) return auth;

    const { id: userId } = await params;
    const { role } = await request.json();

    if (!role || !["user", "uploader", "management", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be one of: user, uploader, management, admin" },
        { status: 400 }
      );
    }

    // Prevent removing your own admin role
    if (userId === auth.session.userId && role !== "admin") {
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

    await logActivity(
      actorFromSession(auth.session),
      "admin.role_change",
      `Changed ${result.rows[0].email} to role ${role}`
    );

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
