import { NextResponse } from "next/server";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

interface PlaylistDetail {
  id: number;
  name: string;
  is_enabled: boolean;
  type: string;
  schedule_items?: {
    id?: number;
    start_time: string;
    end_time: string;
    days: number[];
    start_date?: string;
    end_date?: string;
    loop_once?: boolean;
  }[];
}

// Public endpoint — no auth required
// Returns both the AzuraCast schedule (upcoming entries) AND
// a built schedule from playlist schedule_items (weekly recurring)
export async function GET() {
  if (!AZURACAST_URL) {
    return NextResponse.json({ schedule: [], weeklySchedule: [], playlistNames: {} }, { status: 200 });
  }

  try {
    // Fetch schedule (upcoming entries), playlists list, in parallel
    const [scheduleRes, playlistsRes] = await Promise.all([
      fetch(`${AZURACAST_URL}/api/station/${STATION_ID}/schedule?rows=100`, {
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

    // Fetch details for all playlists to get schedule_items (recurring weekly data)
    const weeklySchedule: {
      playlistId: number;
      playlistName: string;
      startTime: string;
      endTime: string;
      days: number[];
      startDate?: string;
      endDate?: string;
      loopOnce?: boolean;
    }[] = [];

    if (Array.isArray(playlists)) {
      const detailPromises = playlists.map(async (p: PlaylistDetail) => {
        try {
          const res = await fetch(
            `${AZURACAST_URL}/api/station/${STATION_ID}/playlist/${p.id}`,
            {
              headers: {
                "X-API-Key": AZURACAST_API_KEY,
                Accept: "application/json",
              },
              cache: "no-store",
            }
          );
          return res.json();
        } catch {
          return null;
        }
      });

      const details = await Promise.all(detailPromises);

      // Helper: convert AzuraCast time integer (900=09:00) to "HH:MM" string
      const fromTimeInt = (t: string | number): string => {
        if (typeof t === "string" && t.includes(":")) return t;
        const n = typeof t === "string" ? parseInt(t) : t;
        const h = Math.floor(n / 100);
        const m = n % 100;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      };
      // Helper: convert ISO days (1=Mon..7=Sun) to JS days (0=Sun..6=Sat)
      const fromIsoDays = (isoDays: number[]): number[] =>
        (isoDays || []).map((d: number) => (d === 7 ? 0 : d));

      for (const detail of details) {
        if (!detail) continue;
        if (
          detail.schedule_items &&
          Array.isArray(detail.schedule_items) &&
          detail.schedule_items.length > 0
        ) {
          for (const item of detail.schedule_items) {
            weeklySchedule.push({
              playlistId: detail.id,
              playlistName: detail.name,
              startTime: fromTimeInt(item.start_time),
              endTime: fromTimeInt(item.end_time),
              days: fromIsoDays(item.days || []),
              startDate: item.start_date || undefined,
              endDate: item.end_date || undefined,
              loopOnce: item.loop_once || false,
            });
          }
        }
      }
    }

    return NextResponse.json({
      schedule: Array.isArray(schedule) ? schedule : [],
      weeklySchedule,
      playlistNames: playlistMap,
    });
  } catch (error) {
    console.error("Public schedule API error:", error);
    return NextResponse.json(
      { schedule: [], weeklySchedule: [], playlistNames: {} },
      { status: 200 }
    );
  }
}
