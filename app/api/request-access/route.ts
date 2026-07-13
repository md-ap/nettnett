import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendAccessRequestEmail } from "@/lib/email";

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "quetelapongo@proton.me";

// A plain "user" (no permissions yet) asks the admins for a role.
// Sends a notification email to the admin inbox.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("authenticated");
    if (auth instanceof NextResponse) return auth;
    const session = auth.session;

    // Fresh role: someone already granted a role shouldn't re-request
    if (auth.role !== "user") {
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
