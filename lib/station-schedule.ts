// Station-timezone schedule helpers shared by the radio proxy and the
// public broadcast-status endpoint. AzuraCast schedule items use integer
// times (900 = 09:00) and ISO days (1=Mon..7=Sun) in the STATION's
// timezone — never the server's.

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || "";
const STATION_ID = process.env.AZURACAST_STATION_ID || "1";

export interface AzScheduleItemLike {
  start_time: number;
  end_time: number;
  days?: number[];
  start_date?: string | null;
  end_date?: string | null;
}

// The station timezone effectively never changes — cache it per warm instance
let tzCache: { tz: string; ts: number } | null = null;
const TZ_TTL = 10 * 60 * 1000;

export async function getStationTimezone(): Promise<string> {
  if (tzCache && Date.now() - tzCache.ts < TZ_TTL) return tzCache.tz;
  try {
    const res = await fetch(`${AZURACAST_URL}/api/station/${STATION_ID}`, {
      headers: { "X-API-Key": AZURACAST_API_KEY, Accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    const tz = (data && typeof data.timezone === "string" && data.timezone) || "UTC";
    tzCache = { tz, ts: Date.now() };
    return tz;
  } catch {
    return tzCache?.tz || "UTC";
  }
}

// Wall clock in the station's timezone: minutes since midnight, ISO weekday,
// and the calendar date as YYYY-MM-DD.
export function stationNowParts(
  date: Date,
  timeZone: string
): { minutes: number; isoDay: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    minutes: (parseInt(get("hour")) % 24) * 60 + parseInt(get("minute")),
    isoDay: dayMap[get("weekday").slice(0, 3)] || 1,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

const toMinutes = (t: number) => Math.floor(t / 100) * 60 + (t % 100);

// Is the station's current wall clock inside any of these schedule windows?
// Handles date bounds (one-off broadcasts) and windows that cross midnight.
export function isWindowActiveNow(
  items: AzScheduleItemLike[],
  timeZone: string,
  now: Date = new Date()
): boolean {
  if (!items.length) return false;
  const { minutes, isoDay, dateStr } = stationNowParts(now, timeZone);

  return items.some((item) => {
    if (item.start_date && dateStr < item.start_date) return false;
    if (item.end_date && dateStr > item.end_date) return false;

    const startM = toMinutes(item.start_time);
    const endM = toMinutes(item.end_time);
    const days = item.days || [];
    const matchesDay = (d: number) => days.length === 0 || days.includes(d);

    if (endM > startM) {
      return matchesDay(isoDay) && minutes >= startM && minutes < endM;
    }
    // Crosses midnight: active late on the start day, or early on the next
    const yesterdayIso = isoDay === 1 ? 7 : isoDay - 1;
    return (
      (matchesDay(isoDay) && minutes >= startM) ||
      (matchesDay(yesterdayIso) && minutes < endM)
    );
  });
}
