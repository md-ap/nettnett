import { NextResponse } from "next/server";
import { requireRole, canUpload } from "@/lib/auth";
import { listUserItems } from "@/lib/b2";

export async function GET() {
  try {
    const auth = await requireRole(canUpload, {
      forbiddenMessage: "Your account does not have upload permissions yet",
    });
    if (auth instanceof NextResponse) return auth;

    const items = await listUserItems(auth.b2Folder);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("List items error:", error);
    return NextResponse.json(
      { error: "Failed to list items" },
      { status: 500 }
    );
  }
}
