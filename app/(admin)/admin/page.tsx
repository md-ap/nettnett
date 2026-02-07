import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  return <AdminPanel />;
}
