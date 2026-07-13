import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireRole, isAdmin } from "@/lib/auth";
import { logActivity, actorFromSession } from "@/lib/activity-log";

// Admin toggles a user's email verification manually (e.g. to activate a
// registered user without making them click the confirmation email).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(isAdmin);
    if (auth instanceof NextResponse) return auth;

    const { id: userId } = await params;
    const { verified } = await request.json();

    if (typeof verified !== "boolean") {
      return NextResponse.json(
        { error: "verified must be a boolean" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE public.users
       SET email_verified = $1,
           email_verified_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING id, email, email_verified`,
      [verified, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await logActivity(
      actorFromSession(auth.session),
      "admin.verify_toggle",
      `Marked ${result.rows[0].email} as ${verified ? "verified" : "unverified"}`
    );

    return NextResponse.json({
      message: "Verification updated",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Admin toggle verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
