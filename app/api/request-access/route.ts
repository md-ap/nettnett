import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendAccessRequestEmail } from "@/lib/email";

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "quetelapongo@proton.me";

// A plain "user" (no permissions yet) asks the admins for a role.
// Sends a notification email to the admin inbox.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "user") {
      return NextResponse.json(
        { error: "Your account already has permissions" },
        { status: 400 }
      );
    }

    const appUrl = new URL(request.url).origin;
    const ok = await sendAccessRequestEmail(
      ADMIN_NOTIFY_EMAIL,
      `${session.firstName} ${session.lastName}`,
      session.email,
      appUrl
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Could not send the request — try again later" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: "Request sent — an admin will review it soon",
    });
  } catch (error) {
    console.error("Request access error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
