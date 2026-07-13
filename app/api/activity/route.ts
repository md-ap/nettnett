import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireRole, canManageRadio, isAdmin } from "@/lib/auth";
import { logActivity, actorFromSession } from "@/lib/activity-log";

const PAGE_SIZE = 50;
const RETENTION_DAYS = 180;

// Client-reported events. LiveStudio broadcasts straight to the AzuraCast
// harbor over WebSocket, so the server never sees go-live/end — the browser
// reports them here. Whitelisted actions only: a client must not be able to
// forge arbitrary audit entries.
const CLIENT_ACTIONS = new Set(["stream.start", "stream.stop"]);

// GET /api/activity?page=&q=&category= — paginated audit trail (Logs tab).
// ADMIN-only: management users operate the radio but don't see the audit
// trail (the tab is hidden for them too — see ManagementTabs).
export async function GET(request: NextRequest) {
  const auth = await requireRole(isAdmin, {
    forbiddenMessage: "Admin access required",
  });
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const q = (searchParams.get("q") || "").trim().slice(0, 100);
  const category = (searchParams.get("category") || "").trim();

  try {
    if (page === 1) {
      // Opportunistic retention prune (indexed on created_at)
      await pool.query(
        `DELETE FROM public.activity_log
         WHERE created_at < NOW() - make_interval(days => $1)`,
        [RETENTION_DAYS]
      );
    }

    const where: string[] = [];
    const params: unknown[] = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(user_name ILIKE $${params.length} OR detail ILIKE $${params.length} OR action ILIKE $${params.length})`
      );
    }
    if (/^[a-z_]+$/.test(category)) {
      params.push(`${category}.%`);
      where.push(`action LIKE $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.activity_log ${whereSql}`,
      params
    );
    const listRes = await pool.query(
      `SELECT id, user_name, action, detail, created_at
       FROM public.activity_log ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params
    );

    return NextResponse.json({
      entries: listRes.rows.map((r) => ({
        id: r.id,
        userName: r.user_name,
        action: r.action,
        detail: r.detail,
        createdAt: r.created_at,
      })),
      total: totalRes.rows[0]?.n ?? 0,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("Activity list error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}

// POST /api/activity — whitelisted client-side events (live stream start/end).
// Stays management-gated: non-admin DJs report their sessions from LiveStudio.
export async function POST(request: NextRequest) {
  const auth = await requireRole(canManageRadio, {
    forbiddenMessage: "Management access required",
  });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (!CLIENT_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unknown activity action" }, { status: 400 });
    }
    const detail = String(body.detail || "").slice(0, 300) || null;
    await logActivity(actorFromSession(auth.session), action, detail);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Activity POST error:", error);
    return NextResponse.json({ error: "Failed to record activity" }, { status: 500 });
  }
}
