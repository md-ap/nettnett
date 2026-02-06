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
  };

  // Dynamic endpoints with IDs
  const playlistMatch = endpoint.match(/^playlist\/(\d+)$/);
  const playlistSongsMatch = endpoint.match(/^playlist\/(\d+)\/songs$/);

  let apiPath: string;

  if (allowedEndpoints[endpoint]) {
    apiPath = allowedEndpoints[endpoint];
  } else if (playlistMatch) {
    apiPath = `/api/station/${STATION_ID}/playlist/${playlistMatch[1]}`;
  } else if (playlistSongsMatch) {
    apiPath = `/api/station/${STATION_ID}/playlist/${playlistSongsMatch[1]}/songs`;
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

    // Create playlist with default settings
    if (action === "create-playlist") {
      fetchOptions.body = JSON.stringify({
        name: body.name,
        type: "default",
        source: "songs",
        order: "sequential",
        is_enabled: false,
      });
    }

    const res = await fetch(`${AZURACAST_URL}${apiPath}`, fetchOptions);

    // Some endpoints return 204 No Content
    if (res.status === 204) {
      return NextResponse.json({ success: true });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("AzuraCast action error:", error);
    return NextResponse.json(
      { error: "Failed to perform action" },
      { status: 502 }
    );
  }
}
