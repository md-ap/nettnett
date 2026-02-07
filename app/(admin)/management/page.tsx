import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import pool from "@/lib/db";
import ManagementGate from "@/components/ManagementGate";
import ManagementTabs from "@/components/ManagementTabs";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Server-side permission check
  const userResult = await pool.query(
    "SELECT role, can_manage FROM public.users WHERE id = $1",
    [session.userId]
  );
  const user = userResult.rows[0];
  const hasPermission = user?.role === "admin" || user?.can_manage === true;

  if (!hasPermission) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">
        Radio Management
      </h1>

      <ManagementGate>
        <ManagementTabs />
      </ManagementGate>
    </div>
  );
}
