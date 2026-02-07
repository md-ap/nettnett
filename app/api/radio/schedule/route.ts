import { NextResponse } from "next/server";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

// Public endpoint — no auth required
export async function GET() {
  if (!AZURACAST_URL) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    // Fetch schedule and playlists in parallel
    const [scheduleRes, playlistsRes] = await Promise.all([
      fetch(`${AZURACAST_URL}/api/station/${STATION_ID}/schedule`, {
        headers: {
          "X-API-Key": AZURACAST_API_KEY,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
      fetch(`${AZURACAST_URL}/api/station/${STATION_ID}/playlists`, {
        headers: {
          "X-API-Key": AZURACAST_API_KEY,
          Accept: "application/json",
        },
        cache: "no-store",
      }),
    ]);

    const schedule = await scheduleRes.json();
    const playlists = await playlistsRes.json();

    // Build a playlist name lookup
    const playlistMap: Record<number, string> = {};
    if (Array.isArray(playlists)) {
      for (const p of playlists) {
        playlistMap[p.id] = p.name;
      }
    }

    return NextResponse.json({
      schedule: Array.isArray(schedule) ? schedule : [],
      playlistNames: playlistMap,
    });
  } catch (error) {
    console.error("Public schedule API error:", error);
    return NextResponse.json(
      { schedule: [], playlistNames: {} },
      { status: 200 }
    );
  }
}
