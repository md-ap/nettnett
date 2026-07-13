import { getSession, getDbRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fresh role — a demoted admin loses the page on next navigation
  const role = await getDbRole(session.userId, session.role);
  if (role !== "admin") {
    redirect("/dashboard");
  }

  return <AdminPanel />;
}
