import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listUserItems } from "@/lib/b2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await params;

    const userResult = await pool.query(
      "SELECT first_name, last_name, email FROM public.users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0];

    const items = await listUserItems(user.first_name, user.last_name);

    return NextResponse.json({
      user: {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      items,
    });
  } catch (error) {
    console.error("Admin view user files error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
