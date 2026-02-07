import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await params;

    // Prevent deleting yourself
    if (userId === session.userId) {
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

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
