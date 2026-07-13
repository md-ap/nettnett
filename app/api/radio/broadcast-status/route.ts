import { NextResponse } from "next/server";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

const BROADCAST_PLAYLIST_NAME = "URL Broadcast";

// Public endpoint — no auth required.
// Remote URL streams often carry no metadata, so AzuraCast's now-playing
// shows "Station Offline" while a URL broadcast is on air. The public
// player uses this endpoint to display the real broadcast title instead.
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

    const active = Array.isArray(playlists)
      ? playlists.find(
          (p: { name?: string; is_enabled?: boolean }) =>
            typeof p.name === "string" &&
            p.name.startsWith(BROADCAST_PLAYLIST_NAME) &&
            p.is_enabled
        )
      : null;

    const title = active
      ? active.name.slice(BROADCAST_PLAYLIST_NAME.length).replace(/^\s*—\s*/, "") ||
        "URL Broadcast"
      : null;

    return NextResponse.json(
      { active: !!active, title },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } }
    );
  } catch (error) {
    console.error("broadcast-status error:", error);
    return NextResponse.json({ active: false, title: null });
  }
}
