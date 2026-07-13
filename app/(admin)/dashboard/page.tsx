import { getSession, canUpload } from "@/lib/auth";
import { redirect } from "next/navigation";
import pool from "@/lib/db";
import DashboardItems from "@/components/DashboardItems";
import RequestAccess from "@/components/RequestAccess";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Read the role fresh from the DB so an admin's role change applies on
  // the next page load (the JWT keeps the role from login time)
  let role = session.role;
  try {
    const result = await pool.query(
      "SELECT role FROM public.users WHERE id = $1",
      [session.userId]
    );
    role = result.rows[0]?.role || role;
  } catch {
    // fall back to the JWT role if the DB hiccups
  }

  if (!canUpload(role)) {
    return <RequestAccess firstName={session.firstName} />;
  }

  return <DashboardItems />;
}
