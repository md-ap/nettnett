import crypto from "crypto";
import pool from "./db";
import { getUserFolder } from "./b2";

// Allocate a unique B2 folder for a NEW user. The name-based derivation is
// kept for readability, but the result is stored in users.b2_folder and
// never recomputed for authorization — first/last names are not unique.
export async function allocateB2Folder(
  firstName: string,
  lastName: string
): Promise<string> {
  const base = getUserFolder(firstName, lastName);
  const taken = await pool.query(
    "SELECT 1 FROM public.users WHERE b2_folder = $1",
    [base]
  );
  if (taken.rows.length === 0) return base;
  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}
