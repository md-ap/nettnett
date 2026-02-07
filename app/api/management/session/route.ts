import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

const INACTIVITY_TIMEOUT_MINUTES = 5;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check permission against DB (not JWT, for freshness)
    const userResult = await pool.query(
      "SELECT role, can_manage FROM public.users WHERE id = $1",
      [session.userId]
    );
    const user = userResult.rows[0];
    const hasPermission = user?.role === "admin" || user?.can_manage === true;

    if (!hasPermission) {
      return NextResponse.json({ hasPermission: false }, { status: 403 });
    }

    // Auto-expire stale sessions
    await pool.query(
      `UPDATE public.management_sessions
       SET is_active = false
       WHERE is_active = true
       AND last_activity < NOW() - INTERVAL '${INACTIVITY_TIMEOUT_MINUTES} minutes'`
    );

    // Get current active session
    const activeResult = await pool.query(
      `SELECT id, user_id, user_name, started_at, last_activity
       FROM public.management_sessions
       WHERE is_active = true
       LIMIT 1`
    );

    const activeSession = activeResult.rows[0] || null;

    return NextResponse.json({
      hasPermission: true,
      activeSession: activeSession
        ? {
            userId: activeSession.user_id,
            userName: activeSession.user_name,
            startedAt: activeSession.started_at,
            lastActivity: activeSession.last_activity,
          }
        : null,
      isCurrentUser: activeSession?.user_id === session.userId,
    });
  } catch (error) {
    console.error("Management session GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await request.json();
    const userName = `${session.firstName} ${session.lastName}`;

    switch (action) {
      case "claim": {
        // Deactivate any existing active session by another user and record who kicked them
        await pool.query(
          `UPDATE public.management_sessions
           SET is_active = false,
               kicked_by_user_id = $1,
               kicked_by_user_name = $2
           WHERE is_active = true AND user_id != $1`,
          [session.userId, userName]
        );

        // Deactivate own old sessions (if re-claiming)
        await pool.query(
          `UPDATE public.management_sessions
           SET is_active = false
           WHERE is_active = true AND user_id = $1`,
          [session.userId]
        );

        // Create new active session
        await pool.query(
          `INSERT INTO public.management_sessions (user_id, user_name, is_active)
           VALUES ($1, $2, true)`,
          [session.userId, userName]
        );

        return NextResponse.json({ message: "Session claimed" });
      }

      case "release": {
        await pool.query(
          `UPDATE public.management_sessions
           SET is_active = false
           WHERE is_active = true AND user_id = $1`,
          [session.userId]
        );

        return NextResponse.json({ message: "Session released" });
      }

      case "heartbeat": {
        const result = await pool.query(
          `UPDATE public.management_sessions
           SET last_activity = NOW()
           WHERE is_active = true AND user_id = $1
           RETURNING id`,
          [session.userId]
        );

        if (result.rows.length === 0) {
          return NextResponse.json({ active: false, kicked: true });
        }
        return NextResponse.json({ active: true });
      }

      case "check-kicked": {
        // Find the most recent inactive session for this user that has kicked_by info
        const result = await pool.query(
          `SELECT kicked_by_user_id, kicked_by_user_name
           FROM public.management_sessions
           WHERE user_id = $1 AND is_active = false AND kicked_by_user_id IS NOT NULL
           ORDER BY started_at DESC
           LIMIT 1`,
          [session.userId]
        );

        if (result.rows.length > 0 && result.rows[0].kicked_by_user_id) {
          // Clear the kick info after reading (one-time notification)
          await pool.query(
            `UPDATE public.management_sessions
             SET kicked_by_user_id = NULL, kicked_by_user_name = NULL
             WHERE user_id = $1 AND is_active = false AND kicked_by_user_id IS NOT NULL`,
            [session.userId]
          );

          return NextResponse.json({
            kicked: true,
            kickedBy: {
              userId: result.rows[0].kicked_by_user_id,
              userName: result.rows[0].kicked_by_user_name,
            },
          });
        }

        return NextResponse.json({ kicked: false });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Management session POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
