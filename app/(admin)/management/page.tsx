import { getSession, getDbRole, canManageRadio } from "@/lib/auth";
import { redirect } from "next/navigation";
import ManagementGate from "@/components/ManagementGate";
import ManagementTabs from "@/components/ManagementTabs";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Server-side permission check on the fresh role (role ladder:
  // management and admin may enter; the APIs enforce this again)
  const role = await getDbRole(session.userId, session.role);
  if (!canManageRadio(role)) {
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
