import { NextResponse } from "next/server";
import { getStationTimezone, isWindowActiveNow } from "@/lib/station-schedule";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

const BROADCAST_PLAYLIST_NAME = "URL Broadcast";

interface AzScheduleItem {
  start_time: number;
  end_time: number;
  days: number[];
  start_date?: string | null;
  end_date?: string | null;
}

// Public endpoint — no auth required.
// Remote URL streams often carry no metadata, so AzuraCast's now-playing
// shows "Station Offline" while a URL broadcast is on air. The public
// player uses this endpoint to display the real broadcast title instead.
// "Active" is time-aware: is_enabled stays true after the broadcast's
// schedule window ends, so we also check the window against the station's
// current time — otherwise the player would keep showing a stale title.
export async function GET() {
  if (!AZURACAST_URL) {
    return NextResponse.json({ active: false, title: null });
  }

  try {
    const res = await fetch(`${AZURACAST_URL}/api/station/${STATION_ID}/playlists`, {
      headers: { "X-API-Key": AZURACAST_API_KEY, Accept: "application/json" },
      cache: "no-store",
    });
    const playlists = await res.json();

    const candidate = Array.isArray(playlists)
      ? playlists.find(
          (p: { name?: string; is_enabled?: boolean }) =>
            typeof p.name === "string" &&
            p.name.startsWith(BROADCAST_PLAYLIST_NAME) &&
            p.is_enabled
        )
      : null;

    let active = false;
    if (candidate) {
      const [detailRes, tz] = await Promise.all([
        fetch(`${AZURACAST_URL}/api/station/${STATION_ID}/playlist/${candidate.id}`, {
          headers: { "X-API-Key": AZURACAST_API_KEY, Accept: "application/json" },
          cache: "no-store",
        }),
        getStationTimezone(),
      ]);
      const detail = await detailRes.json().catch(() => null);
      const items: AzScheduleItem[] = Array.isArray(detail?.schedule_items)
        ? detail.schedule_items
        : [];
      // No schedule items on a remote playlist = the dangerous always-on
      // Liquidsoap source (see CLAUDE.md gotcha #2) — treat as active
      active = items.length === 0 || isWindowActiveNow(items, tz);
    }

    const title = active
      ? candidate.name.slice(BROADCAST_PLAYLIST_NAME.length).replace(/^\s*—\s*/, "") ||
        "URL Broadcast"
      : null;

    return NextResponse.json(
      { active, title },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } }
    );
  } catch (error) {
    console.error("broadcast-status error:", error);
    return NextResponse.json({ active: false, title: null });
  }
}
