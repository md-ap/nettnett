import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { s3Client, BUCKET_NAME } from "@/lib/b2";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];
const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".aac", ".m4a", ".wma"];
const B2_PUBLIC_URL = "https://f004.backblazeb2.com/file";

// In-memory cache: key → { data, timestamp }
const cache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Public endpoint to fetch item metadata for a given AzuraCast file.
 * Supports two modes:
 *   1. ?path=b2-sync/user_folder/title_folder/file.mp3  (path-based lookup)
 *   2. ?song=NortenoGalactico  (title-based search — when AzuraCast has no path)
 *
 * Tries NileDB first, falls back to B2 metadata.json.
 * No auth required — read-only.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  const songTitle = searchParams.get("song");

  if (filePath) {
    return handlePathLookup(filePath);
  }
  if (songTitle) {
    return handleSongSearch(songTitle);
  }
  return NextResponse.json({ error: "Missing path or song parameter" }, { status: 400 });
}

// --- Path-based lookup (original logic) ---
async function handlePathLookup(filePath: string) {
  const parts = filePath.split("/");

  let userFolder: string;
  let titleFolder: string;

  if (parts[0] === "b2-sync" && parts.length >= 4) {
    userFolder = parts[1];
    titleFolder = parts[2];
  } else if (parts.length >= 3) {
    userFolder = parts[0];
    titleFolder = parts[1];
  } else {
    return NextResponse.json({}, { status: 200 });
  }

  return fetchMetadata(userFolder, titleFolder);
}

// --- Song title search (new: matches filename in B2 against song title) ---
async function handleSongSearch(songTitle: string) {
  const cacheKey = `song:${songTitle}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Normalize the song title for matching against filenames
  // AzuraCast title "NortenoGalactico" should match file "NortenoGalactico.mp3"
  const normalizedSong = songTitle.toLowerCase().replace(/\s+/g, "");

  // Search B2 bucket for all user folders, find audio files matching the song title
  try {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Delimiter: undefined,
      })
    );

    if (listResult.Contents) {
      for (const obj of listResult.Contents) {
        if (!obj.Key || obj.Size === 0) continue;
        const keyParts = obj.Key.split("/");
        // Expected: userFolder/titleFolder/filename
        if (keyParts.length < 3) continue;

        const filename = keyParts[keyParts.length - 1];
        const isAudio = AUDIO_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));
        if (!isAudio) continue;

        // Strip extension and normalize for comparison
        const filenameNoExt = filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/\s+/g, "");
        if (filenameNoExt === normalizedSong) {
          const userFolder = keyParts[0];
          const titleFolder = keyParts[1];
          const result = await fetchMetadata(userFolder, titleFolder);
          // Also cache under the song key
          const body = await result.clone().json();
          if (body.title || body.creator) {
            cache.set(cacheKey, { data: body, ts: Date.now() });
          }
          return result;
        }
      }
    }
  } catch (err) {
    console.error("[radio/metadata] B2 song search failed:", err);
  }

  cache.set(cacheKey, { data: {}, ts: Date.now() });
  return NextResponse.json({});
}

// --- Shared metadata fetcher ---
async function fetchMetadata(userFolder: string, titleFolder: string) {
  const cacheKey = `${userFolder}/${titleFolder}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Helper: find album art image in the B2 item folder
  async function findAlbumArt(): Promise<string | null> {
    try {
      const listResult = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: `${userFolder}/${titleFolder}/`,
        })
      );
      if (!listResult.Contents) return null;
      for (const obj of listResult.Contents) {
        if (!obj.Key || obj.Size === 0) continue;
        const lowerKey = obj.Key.toLowerCase();
        if (IMAGE_EXTENSIONS.some((ext) => lowerKey.endsWith(ext))) {
          return `${B2_PUBLIC_URL}/${BUCKET_NAME}/${obj.Key}`;
        }
      }
    } catch {
      // Can't list files — no art available
    }
    return null;
  }

  // Try NileDB first
  try {
    const result = await pool.query(
      `SELECT i.title, i.creator, i.description, i.date
       FROM public.items i
       JOIN public.users u ON i.user_id = u.id
       WHERE i.folder = $1
       AND CONCAT('user_', LOWER(REPLACE(u.first_name, ' ', '_')), '_', LOWER(REPLACE(u.last_name, ' ', '_'))) = $2
       LIMIT 1`,
      [titleFolder, userFolder]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const artUrl = await findAlbumArt();
      const data = {
        title: row.title || null,
        creator: row.creator || null,
        description: row.description || null,
        date: row.date || null,
        artUrl,
      };
      cache.set(cacheKey, { data, ts: Date.now() });
      return NextResponse.json(data);
    }
  } catch (dbErr) {
    console.error("DB metadata lookup failed:", dbErr);
  }

  // Fallback: read metadata.json from B2
  try {
    const metaResult = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${userFolder}/${titleFolder}/metadata.json`,
      })
    );

    const metaStr = await metaResult.Body?.transformToString();
    if (!metaStr) {
      cache.set(cacheKey, { data: {}, ts: Date.now() });
      return NextResponse.json({});
    }

    const full = JSON.parse(metaStr);
    const artUrl = await findAlbumArt();
    const data = {
      title: full.title || null,
      creator: full.creator || null,
      description: full.description || null,
      date: full.date || null,
      artUrl,
    };

    cache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch {
    cache.set(cacheKey, { data: {}, ts: Date.now() });
    return NextResponse.json({});
  }
}
