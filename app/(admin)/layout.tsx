import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import pool from "@/lib/db";
import Navbar from "@/components/Navbar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch fresh can_manage from DB (graceful if column doesn't exist yet)
  let canManage = false;
  try {
    const userResult = await pool.query(
      "SELECT can_manage FROM public.users WHERE id = $1",
      [session.userId]
    );
    canManage = userResult.rows[0]?.can_manage || false;
  } catch {
    // Column may not exist yet — run /api/setup to create it
  }

  return (
    <div className="min-h-screen">
      <Navbar
        userName={`${session.firstName} ${session.lastName}`}
        isAdmin={session.role === "admin"}
        canManage={canManage}
      />
      <main className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
