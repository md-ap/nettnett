import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

// Proxy GET requests to AzuraCast API
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "nowplaying";

  // Whitelist allowed endpoints
  const allowedEndpoints: Record<string, string> = {
    nowplaying: `/api/nowplaying/${STATION_ID}`,
    status: `/api/station/${STATION_ID}/status`,
    playlists: `/api/station/${STATION_ID}/playlists`,
    files: `/api/station/${STATION_ID}/files`,
    queue: `/api/station/${STATION_ID}/queue`,
    schedule: `/api/station/${STATION_ID}/schedule`,
    streamers: `/api/station/${STATION_ID}/streamers`,
  };

  // Dynamic endpoints with IDs
  const playlistMatch = endpoint.match(/^playlist\/(\d+)$/);
  const playlistSongsMatch = endpoint.match(/^playlist\/(\d+)\/songs$/);
  const streamerMatch = endpoint.match(/^streamer\/(\d+)$/);

  let apiPath: string;

  if (allowedEndpoints[endpoint]) {
    apiPath = allowedEndpoints[endpoint];
  } else if (playlistMatch) {
    apiPath = `/api/station/${STATION_ID}/playlist/${playlistMatch[1]}`;
  } else if (playlistSongsMatch) {
    apiPath = `/api/station/${STATION_ID}/playlist/${playlistSongsMatch[1]}/songs`;
  } else if (streamerMatch) {
    apiPath = `/api/station/${STATION_ID}/streamer/${streamerMatch[1]}`;
  } else {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  try {
    const res = await fetch(`${AZURACAST_URL}${apiPath}`, {
      headers: {
        "X-API-Key": AZURACAST_API_KEY,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("AzuraCast API error:", error);
    return NextResponse.json(
      { error: "Failed to reach AzuraCast" },
      { status: 502 }
    );
  }
}

// Proxy POST/PUT/DELETE actions to AzuraCast API
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, playlistId, mediaId, mediaPath } = body;

    let apiPath: string;
    let method = "POST";

    switch (action) {
      case "skip":
        apiPath = `/api/station/${STATION_ID}/backend/skip`;
        break;
      case "start":
        apiPath = `/api/station/${STATION_ID}/backend/start`;
        break;
      case "stop":
        apiPath = `/api/station/${STATION_ID}/backend/stop`;
        break;
      case "restart":
        apiPath = `/api/station/${STATION_ID}/restart`;
        break;
      case "playlist-toggle":
        apiPath = `/api/station/${STATION_ID}/playlist/${playlistId}/toggle`;
        method = "PUT";
        break;
      case "playlist-update":
        // Update playlist settings (weight, order, etc.)
        apiPath = `/api/station/${STATION_ID}/playlist/${playlistId}`;
        method = "PUT";
        break;
      case "playlist-reorder":
        // Reorder songs within a playlist
        apiPath = `/api/station/${STATION_ID}/playlist/${playlistId}/order`;
        method = "PUT";
        break;
      case "queue-remove":
        apiPath = `/api/station/${STATION_ID}/queue/${body.queueId}`;
        method = "DELETE";
        break;
      case "add-to-playlist":
        // Batch action: move media to playlist
        apiPath = `/api/station/${STATION_ID}/files/batch`;
        method = "PUT";
        break;
      case "remove-from-playlist":
        // Batch action: remove media from all playlists (empty playlists array)
        apiPath = `/api/station/${STATION_ID}/files/batch`;
        method = "PUT";
        break;
      case "create-playlist":
        apiPath = `/api/station/${STATION_ID}/playlists`;
        break;
      case "delete-playlist":
        apiPath = `/api/station/${STATION_ID}/playlist/${playlistId}`;
        method = "DELETE";
        break;
      case "schedule-playlist":
        apiPath = `/api/station/${STATION_ID}/playlist/${playlistId}`;
        method = "PUT";
        break;
      case "unschedule-playlist":
        apiPath = `/api/station/${STATION_ID}/playlist/${playlistId}`;
        method = "PUT";
        break;
      case "create-streamer":
        apiPath = `/api/station/${STATION_ID}/streamers`;
        break;
      case "update-streamer":
        apiPath = `/api/station/${STATION_ID}/streamer/${body.streamerId}`;
        method = "PUT";
        break;
      case "delete-streamer":
        apiPath = `/api/station/${STATION_ID}/streamer/${body.streamerId}`;
        method = "DELETE";
        break;
      case "disconnect-streamer":
        apiPath = `/api/station/${STATION_ID}/backend/disconnect`;
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "X-API-Key": AZURACAST_API_KEY,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    // For batch operations, send the body with file path (AzuraCast requires path, not numeric ID)
    if (action === "add-to-playlist") {
      fetchOptions.body = JSON.stringify({
        do: "playlist",
        playlists: [String(playlistId)],
        files: [mediaPath || mediaId],
      });
    }

    // Remove from playlist: empty playlists array removes from all
    if (action === "remove-from-playlist") {
      fetchOptions.body = JSON.stringify({
        do: "playlist",
        playlists: [],
        files: [mediaPath || mediaId],
      });
    }

    // Update playlist settings (weight, order, name, etc.)
    if (action === "playlist-update") {
      const updateData: Record<string, unknown> = {};
      if (body.weight !== undefined) updateData.weight = body.weight;
      if (body.order !== undefined) updateData.order = body.order;
      if (body.name !== undefined) updateData.name = body.name;
      fetchOptions.body = JSON.stringify(updateData);
    }

    // Reorder songs within a playlist
    if (action === "playlist-reorder") {
      fetchOptions.body = JSON.stringify({
        order: body.order, // array of media IDs in desired order
      });
    }

    // Schedule a playlist — send schedule_items to AzuraCast
    // IMPORTANT: Do NOT send "type" field — AzuraCast uses an enum (PlaylistTypes)
    // that does NOT have a "scheduled" value. Sending it causes a 500 error.
    // Scheduling works by adding schedule_items to any playlist type.
    // AzuraCast uses: start_time/end_time as integers (e.g. 900=09:00, 2200=22:00)
    // and days as ISO-8601 (1=Monday, 7=Sunday) — NOT JS days (0=Sunday, 6=Saturday)
    if (action === "schedule-playlist") {
      const convertedItems = (body.scheduleItems || []).map(
        (item: {
          id?: number;
          start_time: string | number;
          end_time: string | number;
          days: number[];
          start_date?: string;
          end_date?: string;
          loop_once?: boolean;
        }) => {
          // Convert "HH:MM" string → integer (e.g. "09:00" → 900, "22:30" → 2230)
          const toTimeInt = (t: string | number): number => {
            if (typeof t === "number") return t;
            const parts = t.split(":");
            return parseInt(parts[0]) * 100 + parseInt(parts[1]);
          };
          // Convert JS day (0=Sun..6=Sat) → ISO day (1=Mon..7=Sun)
          const toIsoDays = (jsDays: number[]): number[] =>
            jsDays.map((d) => (d === 0 ? 7 : d));

          const converted: Record<string, unknown> = {
            start_time: toTimeInt(item.start_time),
            end_time: toTimeInt(item.end_time),
            days: toIsoDays(item.days || []),
          };
          if (item.id) converted.id = item.id;
          if (item.start_date) converted.start_date = item.start_date;
          if (item.end_date) converted.end_date = item.end_date;
          if (item.loop_once) converted.loop_once = true;
          return converted;
        }
      );

      const scheduleBody: Record<string, unknown> = {
        schedule_items: convertedItems,
      };
      // Include backend_options (e.g. ["interrupt"]) so Liquidsoap interrupts current song
      if (body.backendOptions && Array.isArray(body.backendOptions)) {
        scheduleBody.backend_options = body.backendOptions;
      }
      fetchOptions.body = JSON.stringify(scheduleBody);
    }

    // Unschedule a playlist (remove all schedule items)
    if (action === "unschedule-playlist") {
      fetchOptions.body = JSON.stringify({
        schedule_items: [],
      });
    }

    // Create a new streamer/DJ account
    if (action === "create-streamer") {
      fetchOptions.body = JSON.stringify({
        streamer_username: body.username,
        streamer_password: body.password,
        display_name: body.displayName,
        is_active: body.isActive ?? true,
        enforce_schedule: body.enforceSchedule ?? false,
        comments: body.comments || "",
      });
    }

    // Update streamer settings
    if (action === "update-streamer") {
      const updateData: Record<string, unknown> = {};
      if (body.username !== undefined) updateData.streamer_username = body.username;
      if (body.password) updateData.streamer_password = body.password;
      if (body.displayName !== undefined) updateData.display_name = body.displayName;
      if (body.isActive !== undefined) updateData.is_active = body.isActive;
      if (body.enforceSchedule !== undefined) updateData.enforce_schedule = body.enforceSchedule;
      if (body.comments !== undefined) updateData.comments = body.comments;
      fetchOptions.body = JSON.stringify(updateData);
    }

    // Create playlist with default settings
    if (action === "create-playlist") {
      fetchOptions.body = JSON.stringify({
        name: body.name,
        type: "default",
        source: "songs",
        order: "sequential",
        is_enabled: body.is_enabled ?? false,
      });
    }

    // Log outgoing request for debugging schedule issues
    console.log(`[AzuraCast ${method}] ${apiPath}`, fetchOptions.body ? JSON.parse(fetchOptions.body as string) : "(no body)");

    const res = await fetch(`${AZURACAST_URL}${apiPath}`, fetchOptions);

    // Some endpoints return 204 No Content
    if (res.status === 204) {
      console.log(`[AzuraCast] Response: 204 No Content`);
      return NextResponse.json({ success: true });
    }

    const data = await res.json();
    console.log(`[AzuraCast] Response ${res.status}:`, JSON.stringify(data).slice(0, 500));

    // If AzuraCast returned an error, pass it through
    if (res.status >= 400) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("AzuraCast action error:", error);
    return NextResponse.json(
      { error: "Failed to perform action" },
      { status: 502 }
    );
  }
}
