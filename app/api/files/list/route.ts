import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listUserItems } from "@/lib/b2";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await listUserItems(session.firstName, session.lastName);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("List items error:", error);
    return NextResponse.json(
      { error: "Failed to list items" },
      { status: 500 }
    );
  }
}
