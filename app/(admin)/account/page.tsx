import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import pool from "@/lib/db";
import AccountSettings from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

// Self-service account settings — open to EVERY logged-in role, including
// plain "user" (their upload panel only shows the access-request notice).
export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Fresh profile from the DB (the JWT snapshot lags behind edits); fall
  // back to the JWT claims if the DB hiccups — display-only, the account
  // APIs enforce their own fresh checks.
  let profile = {
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    role: session.role,
    emailVerified: true,
  };
  try {
    const result = await pool.query(
      `SELECT email, first_name, last_name, role, email_verified
       FROM public.users WHERE id = $1`,
      [session.userId]
    );
    const row = result.rows[0];
    if (row) {
      profile = {
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role || "user",
        emailVerified: row.email_verified === true,
      };
    }
  } catch {
    // keep the JWT fallback
  }

  return <AccountSettings initialProfile={profile} />;
}
