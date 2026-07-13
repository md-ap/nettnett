import { NextResponse } from "next/server";
import { getSession, getDbRole, canManageRadio } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  // Fresh role from the DB so the UI (navbar gating) reflects role changes
  // without a re-login. Display-only — APIs enforce their own fresh check.
  const role = await getDbRole(session.userId, session.role);
  return NextResponse.json({
    authenticated: true,
    user: {
      firstName: session.firstName,
      lastName: session.lastName,
      role: role || "user",
      canManage: canManageRadio(role),
    },
  });
}
