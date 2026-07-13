import { redirect } from "next/navigation";
import { getSession, getDbRole } from "@/lib/auth";
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

  // Fresh role from the DB so an admin's role change applies on the next
  // navigation without re-login (JWT keeps the login-time snapshot)
  const role = await getDbRole(session.userId, session.role);

  return (
    <div className="min-h-screen">
      <Navbar
        initialSession={{
          authenticated: true,
          user: {
            firstName: session.firstName,
            lastName: session.lastName,
            role,
          },
        }}
      />
      {/* pb-24 keeps page bottoms clear of the floating player */}
      <main className="mx-auto max-w-7xl px-4 pt-8 pb-24">
        {children}
      </main>
    </div>
  );
}
