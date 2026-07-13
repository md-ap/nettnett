import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  listRecordings,
  getRecordingPlayUrl,
  getRecordingBuffer,
  saveIaSidecar,
  deleteRecording,
} from "@/lib/b2-recordings";
import { uploadToInternetArchive, sanitizeIdentifier } from "@/lib/internet-archive";

// Sending a recording to Internet Archive streams the whole file through
// this function — allow the longest duration Vercel permits.
export const maxDuration = 300;

// GET: list live-session recordings (with presigned play URLs)
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const recordings = await listRecordings();
    const withUrls = await Promise.all(
      recordings.map(async (r) => ({
        ...r,
        playUrl: await getRecordingPlayUrl(r.key),
      }))
    );
    return NextResponse.json(withUrls);
  } catch (error) {
    console.error("Recordings list error:", error);
    return NextResponse.json({ error: "Failed to list recordings" }, { status: 502 });
  }
}

// POST: actions on a recording (send-to-ia, delete)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, key } = body;

    if (!key || typeof key !== "string" || key.includes("..")) {
      return NextResponse.json({ error: "A valid recording key is required" }, { status: 400 });
    }

    if (action === "send-to-ia") {
      const dj = key.split("/")[0] || "dj";
      const recordedAt = key.match(/stream_(\d{8})-(\d{6})/);
      const dateLabel = recordedAt
        ? `${recordedAt[1].slice(0, 4)}-${recordedAt[1].slice(4, 6)}-${recordedAt[1].slice(6, 8)}`
        : new Date().toISOString().slice(0, 10);

      const title =
        (body.title || "").trim() || `NettNett Live — ${dj} — ${dateLabel}`;
      const description =
        (body.description || "").trim() ||
        `Live radio session broadcast on NettNett Radio by ${dj} on ${dateLabel}.`;

      const identifier = sanitizeIdentifier(title, "nettnett-live");
      const filename = key.split("/").pop() || "recording.mp3";

      // Buffer the file from B2 and push it to IA (single file → carries metadata)
      const fileBuffer = await getRecordingBuffer(key);
      const result = await uploadToInternetArchive(
        identifier,
        filename,
        fileBuffer,
        {
          title,
          description,
          mediatype: "audio",
          creator: dj,
          date: dateLabel,
          subject: ["radio", "live", "nettnett"],
          collection: "opensource",
        },
        true
      );

      const iaInfo = {
        identifier,
        url: result.itemUrl,
        sentAt: new Date().toISOString(),
      };
      await saveIaSidecar(key, iaInfo);

      return NextResponse.json({ success: true, ia: iaInfo });
    }

    if (action === "delete") {
      await deleteRecording(key);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Recordings action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 502 }
    );
  }
}
