// Remote audio duration detection for URL broadcasts.
// Strategy:
//   1. Internet Archive URLs → exact duration from the IA metadata API
//   2. Any other URL → estimate by parsing the MP3 header (Xing/Info VBR
//      header when present = exact frame count; otherwise CBR estimate
//      from bitrate + Content-Length)

export interface DetectedDuration {
  seconds: number;
  source: "internet-archive" | "mp3-estimate";
  // Human title when available (IA file/item title) — used as now-playing text
  title: string | null;
}

export async function detectRemoteAudioDuration(
  url: string
): Promise<DetectedDuration | null> {
  const ia = await tryInternetArchive(url).catch(() => null);
  if (ia) return { seconds: ia.seconds, source: "internet-archive", title: ia.title };

  const est = await tryMp3Estimate(url).catch(() => null);
  if (est) return { seconds: est, source: "mp3-estimate", title: null };

  return null;
}

// --- Internet Archive -------------------------------------------------

async function tryInternetArchive(
  url: string
): Promise<{ seconds: number; title: string | null } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)archive\.org$/i.test(parsed.hostname)) return null;

  // Accepts both URL shapes IA serves:
  //   https://archive.org/download/{identifier}/{filename}
  //   https://dn720601.ca.archive.org/0/items/{identifier}/{filename}
  const match =
    parsed.pathname.match(/^\/download\/([^/]+)\/(.+)$/) ||
    parsed.pathname.match(/^\/\d+\/items\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const identifier = match[1];
  const filename = decodeURIComponent(match[2]);

  const res = await fetch(`https://archive.org/metadata/${identifier}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;

  const meta = await res.json();
  const files: { name: string; length?: string; title?: string }[] = Array.isArray(
    meta?.files
  )
    ? meta.files
    : [];
  const file =
    files.find((f) => f.name === filename) ||
    files.find((f) => decodeURIComponent(f.name) === filename);
  if (!file?.length) return null;

  const seconds = parseIaLength(file.length);
  if (!seconds) return null;

  // Prefer the file's own title, then the IA item's title
  const title: string | null =
    (typeof file.title === "string" && file.title.trim()) ||
    (typeof meta?.metadata?.title === "string" && meta.metadata.title.trim()) ||
    null;

  return { seconds, title };
}

// IA "length" comes as seconds ("3723.45") or clock format ("1:02:03" / "62:03")
function parseIaLength(len: string): number | null {
  if (/^[\d.]+$/.test(len)) {
    const s = parseFloat(len);
    return isFinite(s) && s > 0 ? Math.round(s) : null;
  }
  const parts = len.split(":").map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  return s > 0 ? Math.round(s) : null;
}

// --- Generic MP3 estimate ---------------------------------------------

async function tryMp3Estimate(url: string): Promise<number | null> {
  // Ask for the first 128KB; some servers ignore Range, so we also cap reads
  const res = await fetch(url, {
    headers: { Range: "bytes=0-131071" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok && res.status !== 206) return null;

  // Total file size: from Content-Range (206) or Content-Length (200)
  let totalBytes: number | null = null;
  const contentRange = res.headers.get("content-range");
  if (contentRange) {
    const m = contentRange.match(/\/(\d+)\s*$/);
    if (m) totalBytes = parseInt(m[1]);
  } else {
    const cl = res.headers.get("content-length");
    if (cl) totalBytes = parseInt(cl);
  }

  const buf = await readUpTo(res, 131072);
  if (buf.length < 4096) return null;

  return parseMp3Duration(buf, totalBytes);
}

// Read at most `max` bytes from the response body, then cancel
async function readUpTo(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const all = new Uint8Array(await res.arrayBuffer());
    return all.subarray(0, max);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(size, max));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, out.length - off);
    out.set(c.subarray(0, take), off);
    off += take;
    if (off >= out.length) break;
  }
  return out;
}

function parseMp3Duration(buf: Uint8Array, totalBytes: number | null): number | null {
  let offset = 0;

  // Skip ID3v2 tag if present (size is a 28-bit synchsafe integer)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33 && buf.length > 10) {
    const tagSize =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    offset = 10 + tagSize;
  }

  // Find the first MP3 frame sync (11 set bits)
  while (offset + 4 < buf.length) {
    if (buf[offset] === 0xff && (buf[offset + 1] & 0xe0) === 0xe0) break;
    offset++;
  }
  if (offset + 44 > buf.length) return null;

  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];

  const versionBits = (b1 >> 3) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layerBits = (b1 >> 1) & 3; // 1 = Layer III
  const bitrateIdx = (b2 >> 4) & 15;
  const sampleRateIdx = (b2 >> 2) & 3;

  if (layerBits !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || sampleRateIdx === 3) {
    return null;
  }

  const isMpeg1 = versionBits === 3;
  const bitrateTable = isMpeg1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRateTable =
    versionBits === 3
      ? [44100, 48000, 32000]
      : versionBits === 2
        ? [22050, 24000, 16000]
        : [11025, 12000, 8000];

  const bitrate = bitrateTable[bitrateIdx] * 1000;
  const sampleRate = sampleRateTable[sampleRateIdx];
  const samplesPerFrame = isMpeg1 ? 1152 : 576;

  // VBR: look for a Xing/Info header right after the side info — its frame
  // count gives an exact duration regardless of variable bitrate
  const channelMode = (b3 >> 6) & 3;
  const sideInfoSize = isMpeg1 ? (channelMode === 3 ? 17 : 32) : channelMode === 3 ? 9 : 17;
  const xingOff = offset + 4 + sideInfoSize;
  if (xingOff + 12 < buf.length) {
    const tag = String.fromCharCode(buf[xingOff], buf[xingOff + 1], buf[xingOff + 2], buf[xingOff + 3]);
    if (tag === "Xing" || tag === "Info") {
      const flags =
        (buf[xingOff + 4] << 24) | (buf[xingOff + 5] << 16) | (buf[xingOff + 6] << 8) | buf[xingOff + 7];
      if (flags & 1) {
        const frames =
          (buf[xingOff + 8] << 24) | (buf[xingOff + 9] << 16) | (buf[xingOff + 10] << 8) | buf[xingOff + 11];
        if (frames > 0) return Math.round((frames * samplesPerFrame) / sampleRate);
      }
    }
  }

  // CBR fallback: estimate from total size and header bitrate
  if (!totalBytes || !bitrate) return null;
  const audioBytes = totalBytes - offset;
  if (audioBytes <= 0) return null;
  return Math.round((audioBytes * 8) / bitrate);
}
