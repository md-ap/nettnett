import pool from "./db";
import type { JWTPayload } from "./auth";

// Best-effort audit trail (Logs tab in /management). A log write must never
// break the action it documents: errors are swallowed after console.error.
// Callers AWAIT it — on Vercel a fire-and-forget insert can be killed when
// the response ends (same reason the NAS webhooks are awaited).

export interface ActivityActor {
  userId: string | null;
  userName: string;
}

export function actorFromSession(session: JWTPayload): ActivityActor {
  return {
    userId: session.userId,
    userName: `${session.firstName} ${session.lastName}`.trim(),
  };
}

export async function logActivity(
  actor: ActivityActor,
  action: string,
  detail?: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.activity_log (user_id, user_name, action, detail)
       VALUES ($1, $2, $3, $4)`,
      [
        actor.userId,
        actor.userName.slice(0, 200) || "Unknown",
        action.slice(0, 100),
        detail ? detail.slice(0, 500) : null,
      ]
    );
  } catch (err) {
    console.error("activity_log write failed:", err);
  }
}
