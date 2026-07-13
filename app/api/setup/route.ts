import { NextResponse } from "next/server";
import { requireAdminOrBootstrap } from "@/lib/auth";
import { initializeDatabase, migrateAddRoleColumn, migrateAddCanManageColumn, migrateCreateManagementSessions, migrateCreatePasswordResetTokens, migrateEmailVerification, migrateRolesOverhaul, migrateB2Folder, migrateActivityLog } from "@/lib/db-init";

// Idempotent schema setup + migrations. Admin-only once users exist
// (mutating DDL must not be a public GET); open only on a fresh install.
export async function GET() {
  const gate = await requireAdminOrBootstrap();
  if (gate instanceof NextResponse) return gate;

  try {
    await initializeDatabase();
    await migrateAddRoleColumn();
    await migrateAddCanManageColumn();
    await migrateCreateManagementSessions();
    await migrateCreatePasswordResetTokens();
    await migrateEmailVerification();
    await migrateRolesOverhaul();
    await migrateB2Folder();
    await migrateActivityLog();
    return NextResponse.json({ message: "Database initialized and migrated successfully" });
  } catch (error) {
    console.error("Database initialization error:", error);
    return NextResponse.json(
      { error: "Failed to initialize database" },
      { status: 500 }
    );
  }
}
