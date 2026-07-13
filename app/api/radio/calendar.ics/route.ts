import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

// Public iCalendar feed of the radio programming — subscribable from
// Google Calendar (Settings → Add calendar → From URL), Apple Calendar /
// Outlook (webcal://). Emits the RESOLVED upcoming instances from
// AzuraCast's schedule API (absolute UTC instants: streamer slots and
// date-bound URL broadcasts included, DST handled upstream — no
// VTIMEZONE/RRULE reconstruction needed). Subscribed clients re-fetch
// periodically, so the ~2-week rolling window keeps advancing; events
// removed from the AzuraCast schedule disappear on the next sync.

interface AzuraScheduleEntry {
  id: number;
  type: string; // "playlist" | "streamer"
  name?: string;
  title?: string;
  description?: string;
  start_timestamp: number; // unix seconds
  end_timestamp: number;
}

// RFC 5545 TEXT escaping: backslash first, then structural chars
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 line folding: content lines max ~75 octets, continuation
// lines start with a single space (folded at 73 chars to stay safe)
function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

// Unix seconds → ICS UTC stamp (20260714T180000Z)
function icsUtc(unixSeconds: number): string {
  return new Date(unixSeconds * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

// Human title: URL-broadcast playlists carry app-added prefixes
// ("URL: <title>" scheduled, "URL Broadcast — <title>" instant)
function displayTitle(entry: AzuraScheduleEntry): string {
  const name = entry.name || entry.title || "NettNett Radio";
  if (name.startsWith("URL: ")) return name.slice("URL: ".length);
  if (name.startsWith("URL Broadcast — "))
    return name.slice("URL Broadcast — ".length);
  return name;
}

export async function GET(request: NextRequest) {
  if (!AZURACAST_URL) {
    return NextResponse.json({ error: "Radio not configured" }, { status: 503 });
  }

  try {
    // ~2-week window (AzuraCast defaults to a shorter horizon without
    // start/end; older versions ignore the params — still fine)
    const startDate = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = await fetch(
      `${AZURACAST_URL}/api/station/${STATION_ID}/schedule?rows=200&start=${startDate}&end=${endDate}`,
      {
        headers: { "X-API-Key": AZURACAST_API_KEY, Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`AzuraCast schedule ${res.status}`);
    const schedule = await res.json();

    let appUrl = "";
    try {
      appUrl = getAppUrl(request);
    } catch {
      // URL property is optional — feed still works without it
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const dtstamp = icsUtc(nowSec);
    const seen = new Set<string>();

    const events: string[] = [];
    const entries: AzuraScheduleEntry[] = Array.isArray(schedule) ? schedule : [];
    entries.sort((a, b) => (a.start_timestamp || 0) - (b.start_timestamp || 0));

    for (const entry of entries) {
      if (!entry?.start_timestamp || !entry?.end_timestamp) continue;
      if (entry.end_timestamp <= nowSec) continue; // fully in the past

      // One VEVENT per instance; id repeats weekly, so key on id+start
      const uid = `nnr-${entry.type || "event"}-${entry.id}-${entry.start_timestamp}@nettnett-radio`;
      if (seen.has(uid)) continue;
      seen.add(uid);

      const summary =
        displayTitle(entry) + (entry.type === "streamer" ? " (live)" : "");
      // AzuraCast auto-descriptions ("Playlist: <name>", "Streamer: <name>")
      // just repeat the raw playlist name — treat them as noise
      const rawDescription = entry.description?.trim() || "";
      const description =
        !rawDescription || /^(Playlist|Streamer):/i.test(rawDescription)
          ? "NettNett Radio — scheduled broadcast"
          : rawDescription;

      const lines = [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${icsUtc(entry.start_timestamp)}`,
        `DTEND:${icsUtc(entry.end_timestamp)}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(description)}`,
      ];
      if (appUrl) lines.push(`URL:${appUrl}/program`);
      lines.push("STATUS:CONFIRMED", "END:VEVENT");
      events.push(lines.map(foldLine).join("\r\n"));
    }

    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NettNett Radio//Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      foldLine(`X-WR-CALNAME:${icsEscape("NettNett Radio")}`),
      foldLine(`X-WR-CALDESC:${icsEscape("NettNett Radio broadcast schedule")}`),
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      ...events,
      "END:VCALENDAR",
      "", // trailing CRLF
    ].join("\r\n");

    return new NextResponse(calendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="nettnett-radio.ics"',
        // Edge-cacheable: calendar apps poll infrequently anyway
        "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    // 503 (not an empty 200): subscribed clients keep their last good
    // copy instead of wiping every event until the next refresh
    return NextResponse.json({ error: "Schedule unavailable" }, { status: 503 });
  }
}
