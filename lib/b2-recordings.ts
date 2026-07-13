// Access to the PRIVATE recordings bucket (nettnett-recordings).
// AzuraCast writes live-session recordings here automatically
// (path: {dj_username}/stream_{YYYYMMDD}-{HHMMSS}.mp3).
// This bucket is private, so playback/downloads use presigned URLs.

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const recordingsS3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_RECORDINGS_KEY_ID!,
    secretAccessKey: process.env.B2_RECORDINGS_APPLICATION_KEY!,
  },
  forcePathStyle: true,
});

export const RECORDINGS_BUCKET = process.env.B2_RECORDINGS_BUCKET_NAME!;

// Recording bitrate configured in AzuraCast (record_streams_bitrate) —
// used to estimate duration from file size (CBR)
const RECORDING_BITRATE_BPS = 192_000;

export interface RecordingIaInfo {
  identifier: string;
  url: string;
  sentAt: string;
}

export interface Recording {
  key: string;
  dj: string;
  filename: string;
  recordedAt: string | null; // ISO date parsed from filename
  sizeBytes: number;
  estimatedDurationSec: number;
  ia: RecordingIaInfo | null;
}

const IA_SIDECAR_SUFFIX = ".ia.json";

// Parse "dj/stream_20260713-013652.mp3" → ISO timestamp
function parseRecordedAt(filename: string): string | null {
  const m = filename.match(/stream_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

export async function listRecordings(): Promise<Recording[]> {
  const result = await recordingsS3.send(
    new ListObjectsV2Command({ Bucket: RECORDINGS_BUCKET })
  );
  const objects = result.Contents || [];

  const sidecarKeys = new Set(
    objects
      .filter((o) => o.Key?.endsWith(IA_SIDECAR_SUFFIX))
      .map((o) => o.Key as string)
  );

  const recordings: Recording[] = [];
  for (const obj of objects) {
    const key = obj.Key;
    if (!key || key.endsWith(IA_SIDECAR_SUFFIX) || obj.Size === 0) continue;

    const parts = key.split("/");
    if (parts.length < 2) continue;
    const dj = parts[0];
    const filename = parts.slice(1).join("/");

    let ia: RecordingIaInfo | null = null;
    if (sidecarKeys.has(`${key}${IA_SIDECAR_SUFFIX}`)) {
      try {
        const sidecar = await recordingsS3.send(
          new GetObjectCommand({ Bucket: RECORDINGS_BUCKET, Key: `${key}${IA_SIDECAR_SUFFIX}` })
        );
        const text = await sidecar.Body?.transformToString();
        if (text) ia = JSON.parse(text);
      } catch {
        // sidecar unreadable — treat as not sent
      }
    }

    recordings.push({
      key,
      dj,
      filename,
      recordedAt: parseRecordedAt(filename),
      sizeBytes: obj.Size || 0,
      estimatedDurationSec: Math.round(((obj.Size || 0) * 8) / RECORDING_BITRATE_BPS),
      ia,
    });
  }

  // Newest first
  recordings.sort((a, b) => (b.recordedAt || "").localeCompare(a.recordedAt || ""));
  return recordings;
}

// Presigned GET for playback/download from the private bucket
export async function getRecordingPlayUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    recordingsS3,
    new GetObjectCommand({ Bucket: RECORDINGS_BUCKET, Key: key }),
    { expiresIn }
  );
}

export async function getRecordingBuffer(key: string): Promise<Buffer> {
  const result = await recordingsS3.send(
    new GetObjectCommand({ Bucket: RECORDINGS_BUCKET, Key: key })
  );
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty recording body");
  return Buffer.from(bytes);
}

export async function saveIaSidecar(key: string, info: RecordingIaInfo): Promise<void> {
  await recordingsS3.send(
    new PutObjectCommand({
      Bucket: RECORDINGS_BUCKET,
      Key: `${key}${IA_SIDECAR_SUFFIX}`,
      Body: Buffer.from(JSON.stringify(info, null, 2)),
      ContentType: "application/json",
    })
  );
}

export async function deleteRecording(key: string): Promise<void> {
  await recordingsS3.send(
    new DeleteObjectCommand({ Bucket: RECORDINGS_BUCKET, Key: key })
  );
  // Best-effort sidecar cleanup
  try {
    await recordingsS3.send(
      new DeleteObjectCommand({ Bucket: RECORDINGS_BUCKET, Key: `${key}${IA_SIDECAR_SUFFIX}` })
    );
  } catch {
    // no sidecar — fine
  }
}
