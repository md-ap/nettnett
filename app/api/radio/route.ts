import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageRadio, getDbRole } from "@/lib/auth";
import { detectRemoteAudioDuration } from "@/lib/audio-duration";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

// Proxy GET requests to AzuraCast API
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageRadio(await getDbRole(session.userId, session.role))) {
    return NextResponse.json(
      { error: "Management access required" },
      { status: 403 }
    );
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

  // Aggregated view of all URL broadcast playlists (instant + scheduled)
  if (endpoint === "url-broadcasts") {
    try {
      return await handleListUrlBroadcasts();
    } catch (e) {
      console.error("url-broadcasts list error:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to list URL broadcasts" },
        { status: 502 }
      );
    }
  }

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
  if (!canManageRadio(await getDbRole(session.userId, session.role))) {
    return NextResponse.json(
      { error: "Management access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { action, playlistId, mediaId, mediaPath } = body;

    // URL Broadcast: orchestrated multi-step actions (validated flow):
    // remote_url playlists do NOT enter the AutoDJ rotation queue — they only
    // play via schedule. Start = fresh playlist + schedule NOW + interrupt +
    // reload. Stop = DELETE the playlist + reload (see handleStopBroadcastUrl
    // for why disabling is not enough).
    if (action === "broadcast-url") {
      try {
        return await handleBroadcastUrl(body);
      } catch (e) {
        console.error("broadcast-url error:", e);
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to start URL broadcast" },
          { status: 502 }
        );
      }
    }
    if (action === "stop-broadcast-url") {
      try {
        return await handleStopBroadcastUrl();
      } catch (e) {
        console.error("stop-broadcast-url error:", e);
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to stop URL broadcast" },
          { status: 502 }
        );
      }
    }
    if (action === "detect-url-duration") {
      try {
        const detected = await detectRemoteAudioDuration(String(body.url || ""));
        return NextResponse.json({
          seconds: detected?.seconds ?? null,
          source: detected?.source ?? null,
        });
      } catch (e) {
        console.error("detect-url-duration error:", e);
        return NextResponse.json({ seconds: null, source: null });
      }
    }
    if (action === "schedule-url-broadcast") {
      try {
        return await handleScheduleUrlBroadcast(body);
      } catch (e) {
        console.error("schedule-url-broadcast error:", e);
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to schedule URL broadcast" },
          { status: 502 }
        );
      }
    }
    if (action === "delete-url-broadcast") {
      try {
        return await handleDeleteUrlBroadcast(Number(body.playlistId));
      } catch (e) {
        console.error("delete-url-broadcast error:", e);
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to delete URL broadcast" },
          { status: 502 }
        );
      }
    }

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

// ============================================================
// URL Broadcast — play a public MP3/stream URL on air
// (replicates the legacy NettNett flow: paste an Internet Archive
// URL and it takes over the Icecast broadcast)
// ============================================================

const BROADCAST_PLAYLIST_NAME = "URL Broadcast";
// Scheduled URL broadcasts each get their own playlist: "URL: <title>"
const SCHEDULED_URL_PREFIX = "URL: ";

interface AzPlaylist {
  id: number;
  name: string;
  is_enabled: boolean;
  remote_url: string | null;
}

interface AzScheduleItem {
  id?: number;
  start_time: number;
  end_time: number;
  days: number[];
  start_date?: string | null;
  end_date?: string | null;
  loop_once?: boolean;
}

interface AzPlaylistDetail extends AzPlaylist {
  schedule_items?: AzScheduleItem[];
}

// Minimal authenticated fetch against AzuraCast that throws on error
async function azuracast<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AZURACAST_URL}${path}`, {
    ...init,
    headers: {
      "X-API-Key": AZURACAST_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => null);
  if (res.status >= 400) {
    const msg =
      (data && typeof data === "object" && "message" in data && (data as { message?: string }).message) ||
      `AzuraCast error ${res.status}`;
    throw new Error(String(msg));
  }
  return data as T;
}

// Current wall-clock in the station's timezone, as AzuraCast schedule values:
// time integer (900 = 09:00, 2230 = 22:30) and ISO day (1=Mon..7=Sun)
function scheduleParts(date: Date, timeZone: string): { timeInt: number; isoDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    timeInt: (parseInt(get("hour")) % 24) * 100 + parseInt(get("minute")),
    isoDay: dayMap[get("weekday")] || 1,
  };
}

// The instant playlist embeds the human title in its name
// ("URL Broadcast — My Show") so now-playing displays can show it —
// remote streams often carry no metadata and would otherwise render
// as "Station Offline" in AzuraCast's now playing.
async function findBroadcastPlaylist(): Promise<AzPlaylist | undefined> {
  const playlists = await azuracast<AzPlaylist[]>(`/api/station/${STATION_ID}/playlists`);
  return playlists.find((p) => p.name.startsWith(BROADCAST_PLAYLIST_NAME));
}

function extractInstantTitle(name: string): string {
  const rest = name.slice(BROADCAST_PLAYLIST_NAME.length).replace(/^\s*—\s*/, "");
  return rest || "URL Broadcast";
}

function deriveTitleFromUrl(url: string): string {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return base.replace(/\.[a-z0-9]{2,4}$/i, "") || "URL Broadcast";
  } catch {
    return "URL Broadcast";
  }
}

async function handleBroadcastUrl(body: { url?: string; durationMinutes?: number }) {
  const url = (body.url || "").trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 });
  }

  // Inspect the audio: duration (exact via Internet Archive metadata,
  // estimated via MP3 headers) AND a human title for now-playing displays.
  const detected = await detectRemoteAudioDuration(url).catch(() => null);

  let detectedSource: string | null = null;
  let duration: number;
  if (body.durationMinutes && body.durationMinutes > 0) {
    duration = body.durationMinutes;
  } else if (detected) {
    duration = Math.ceil(detected.seconds / 60);
    detectedSource = detected.source;
  } else {
    duration = 60;
  }
  duration = Math.min(Math.max(duration, 5), 360);

  const displayTitle = (detected?.title || deriveTitleFromUrl(url)).slice(0, 60);

  // 1. Recreate the dedicated remote playlist from scratch. IMPORTANT: a
  // stale remote playlist (even disabled) with no schedule gets baked into
  // the Liquidsoap config as an always-available mksafe(input.http(...))
  // source and hijacks the rotation after a station restart — so we always
  // delete any previous instance and create a fresh one.
  const existing = await findBroadcastPlaylist();
  if (existing) {
    await azuracast(`/api/station/${STATION_ID}/playlist/${existing.id}`, { method: "DELETE" });
  }
  const playlist = await azuracast<AzPlaylist>(`/api/station/${STATION_ID}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name: `${BROADCAST_PLAYLIST_NAME} — ${displayTitle}`,
      source: "remote_url",
      remote_url: url,
      remote_type: "stream",
      type: "default",
      order: "sequential",
      is_enabled: true,
    }),
  });

  // 2. Schedule window "now" in the STATION's timezone (not the server's)
  const station = await azuracast<{ timezone?: string }>(`/api/station/${STATION_ID}`);
  const tz = station?.timezone || "UTC";
  const start = scheduleParts(new Date(Date.now() - 2 * 60 * 1000), tz);
  const end = scheduleParts(new Date(Date.now() + duration * 60 * 1000), tz);

  // 3. Schedule it NOW with interrupt (created enabled, so no toggle needed)
  await azuracast(`/api/station/${STATION_ID}/playlist/${playlist.id}`, {
    method: "PUT",
    body: JSON.stringify({
      schedule_items: [
        { start_time: start.timeInt, end_time: end.timeInt, days: [start.isoDay] },
      ],
      backend_options: ["interrupt"],
    }),
  });

  // 4. Reload so Liquidsoap picks up the new schedule (takes ~30s to switch)
  await azuracast(`/api/station/${STATION_ID}/reload`, { method: "POST" });

  return NextResponse.json({
    success: true,
    playlistId: playlist.id,
    durationMinutes: duration,
    detectedSource,
    displayTitle,
  });
}

// Create a one-off scheduled URL broadcast: its own playlist ("URL: <title>")
// with a date-bound schedule item, so multiple broadcasts with different URLs
// can coexist on the calendar without overwriting each other.
async function handleScheduleUrlBroadcast(body: {
  title?: string;
  url?: string;
  date?: string; // YYYY-MM-DD (station timezone)
  startTime?: string; // HH:MM (station timezone)
  durationMinutes?: number;
}) {
  const title = (body.title || "").trim();
  const url = (body.url || "").trim();
  const date = (body.date || "").trim();
  const startTime = (body.startTime || "").trim();

  if (!title || title.length > 80) {
    return NextResponse.json({ error: "A title (max 80 chars) is required" }, { status: 400 });
  }
  if (!/^https?:\/\/.+/i.test(url)) {
    return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: "A valid start time (HH:MM) is required" }, { status: 400 });
  }

  // Duration: explicit or auto-detected; for scheduled shows we require one
  let detectedSource: string | null = null;
  let duration: number;
  if (body.durationMinutes && body.durationMinutes > 0) {
    duration = body.durationMinutes;
  } else {
    const detected = await detectRemoteAudioDuration(url).catch(() => null);
    if (!detected) {
      return NextResponse.json(
        { error: "Could not detect the audio duration — please choose one manually" },
        { status: 400 }
      );
    }
    duration = Math.ceil(detected.seconds / 60);
    detectedSource = detected.source;
  }
  duration = Math.min(Math.max(duration, 5), 360);

  // No duplicate titles
  const name = `${SCHEDULED_URL_PREFIX}${title}`;
  const playlists = await azuracast<AzPlaylist[]>(`/api/station/${STATION_ID}/playlists`);
  if (playlists.some((p) => p.name === name)) {
    return NextResponse.json(
      { error: "A scheduled URL broadcast with that title already exists" },
      { status: 400 }
    );
  }

  // Schedule window (station-timezone wall clock, date-bound one-off)
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = startTime.split(":").map(Number);
  if (hh > 23 || mm > 59) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  }
  const jsDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun

  const startMinutes = hh * 60 + mm;
  const endMinutes = startMinutes + duration;
  let endDate = date;
  if (endMinutes >= 1440) {
    // Crosses midnight → end date is the next calendar day
    const next = new Date(Date.UTC(y, mo - 1, d) + 86400000);
    endDate = next.toISOString().slice(0, 10);
  }
  const toTimeInt = (mins: number) => Math.floor((mins % 1440) / 60) * 100 + ((mins % 1440) % 60);

  // Create the dedicated playlist + schedule + interrupt, then reload
  const playlist = await azuracast<AzPlaylist>(`/api/station/${STATION_ID}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      source: "remote_url",
      remote_url: url,
      remote_type: "stream",
      type: "default",
      order: "sequential",
      is_enabled: true,
    }),
  });

  await azuracast(`/api/station/${STATION_ID}/playlist/${playlist.id}`, {
    method: "PUT",
    body: JSON.stringify({
      schedule_items: [
        {
          start_time: toTimeInt(startMinutes),
          end_time: toTimeInt(endMinutes),
          days: [isoDay],
          start_date: date,
          end_date: endDate,
        },
      ],
      backend_options: ["interrupt"],
    }),
  });

  await azuracast(`/api/station/${STATION_ID}/reload`, { method: "POST" });

  return NextResponse.json({
    success: true,
    playlistId: playlist.id,
    name,
    durationMinutes: duration,
    detectedSource,
  });
}

async function handleDeleteUrlBroadcast(playlistId: number) {
  if (!playlistId || isNaN(playlistId)) {
    return NextResponse.json({ error: "playlistId is required" }, { status: 400 });
  }
  // Only allow deleting URL broadcast playlists through this action
  const detail = await azuracast<AzPlaylistDetail>(
    `/api/station/${STATION_ID}/playlist/${playlistId}`
  );
  const isUrlBroadcast =
    detail.name.startsWith(BROADCAST_PLAYLIST_NAME) ||
    detail.name.startsWith(SCHEDULED_URL_PREFIX);
  if (!isUrlBroadcast) {
    return NextResponse.json(
      { error: "Not a URL broadcast playlist" },
      { status: 400 }
    );
  }
  await azuracast(`/api/station/${STATION_ID}/playlist/${playlistId}`, { method: "DELETE" });
  await azuracast(`/api/station/${STATION_ID}/reload`, { method: "POST" });
  return NextResponse.json({ success: true });
}

async function handleListUrlBroadcasts() {
  const playlists = await azuracast<AzPlaylist[]>(`/api/station/${STATION_ID}/playlists`);
  const urlPlaylists = playlists.filter(
    (p) =>
      p.name.startsWith(BROADCAST_PLAYLIST_NAME) || p.name.startsWith(SCHEDULED_URL_PREFIX)
  );
  const detailed = await Promise.all(
    urlPlaylists.map((p) =>
      azuracast<AzPlaylistDetail>(`/api/station/${STATION_ID}/playlist/${p.id}`)
    )
  );
  return NextResponse.json(
    detailed.map((d) => {
      const isInstant = d.name.startsWith(BROADCAST_PLAYLIST_NAME);
      return {
        id: d.id,
        name: d.name,
        title: isInstant
          ? extractInstantTitle(d.name)
          : d.name.slice(SCHEDULED_URL_PREFIX.length),
        is_instant: isInstant,
        is_enabled: d.is_enabled,
        remote_url: d.remote_url,
        schedule_items: d.schedule_items || [],
      };
    })
  );
}

async function handleStopBroadcastUrl() {
  const playlist = await findBroadcastPlaylist();
  if (!playlist) {
    return NextResponse.json({ success: true, message: "No URL broadcast playlist exists" });
  }

  // DELETE the playlist outright. Disabling/unscheduling is NOT enough: a
  // schedule-less remote playlist stays in the generated Liquidsoap config
  // as an always-available mksafe(input.http(...)) source, and hijacks the
  // rotation (with empty metadata, which also wedges the nowplaying worker)
  // after the next station restart. broadcast-url recreates it on demand.
  await azuracast(`/api/station/${STATION_ID}/playlist/${playlist.id}`, { method: "DELETE" });
  await azuracast(`/api/station/${STATION_ID}/reload`, { method: "POST" });

  return NextResponse.json({ success: true });
}
