import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireRole, isAdmin } from "@/lib/auth";
import { logActivity, actorFromSession } from "@/lib/activity-log";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(isAdmin);
    if (auth instanceof NextResponse) return auth;

    const { id: userId } = await params;

    // Prevent deleting yourself
    if (userId === auth.session.userId) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const userResult = await pool.query(
      "SELECT id, email FROM public.users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Protect super admin account
    if (userResult.rows[0].email === "info@mdap.io") {
      return NextResponse.json(
        { error: "Cannot delete the super admin account" },
        { status: 400 }
      );
    }

    // Delete user (CASCADE deletes items and files)
    await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);

    await logActivity(
      actorFromSession(auth.session),
      "admin.user_delete",
      `Deleted user ${userResult.rows[0].email}`
    );

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
