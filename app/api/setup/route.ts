import { NextResponse } from "next/server";
import { initializeDatabase, migrateAddRoleColumn, migrateAddCanManageColumn, migrateCreateManagementSessions, migrateCreatePasswordResetTokens, migrateEmailVerification, migrateRolesOverhaul, migrateB2Folder } from "@/lib/db-init";

export async function GET() {
  try {
    await initializeDatabase();
    await migrateAddRoleColumn();
    await migrateAddCanManageColumn();
    await migrateCreateManagementSessions();
    await migrateCreatePasswordResetTokens();
    await migrateEmailVerification();
    await migrateRolesOverhaul();
    await migrateB2Folder();
    return NextResponse.json({ message: "Database initialized and migrated successfully" });
  } catch (error) {
    console.error("Database initialization error:", error);
    return NextResponse.json(
      { error: "Failed to initialize database" },
      { status: 500 }
    );
  }
}
