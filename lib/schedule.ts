// Shared week/schedule helpers (client-safe) used by the management
// ScheduleCalendar and the public /program page — previously duplicated
// verbatim in both files. Weeks start on Sunday (0=Sun … 6=Sat), matching
// JS Date.getDay(); the AzuraCast ISO mapping (1=Mon…7=Sun) is handled at
// the API boundary by the consumers, not here.

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM[:SS]" → "HH:MM"
export function formatTime24(time: string): string {
  const parts = time.split(":");
  return `${parts[0]}:${parts[1]}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startStr = `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}`;
  const endStr = `${weekStart.getMonth() !== end.getMonth() ? MONTHS_SHORT[end.getMonth()] + " " : ""}${end.getDate()}, ${end.getFullYear()}`;
  return `${startStr} – ${endStr}`;
}

export function formatDayDate(weekStart: Date, dayIdx: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIdx);
  return `${d.getDate()}`;
}

export function formatDayFull(weekStart: Date, dayIdx: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIdx);
  return `${DAY_NAMES[dayIdx]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Is "now" inside [startTime, endTime) on the given weekday?
// Handles ranges that wrap past midnight.
export function isNowInRange(startTime: string, endTime: string, dayNum: number): boolean {
  const now = new Date();
  if (now.getDay() !== dayNum) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  if (endMins > startMins) {
    return nowMins >= startMins && nowMins < endMins;
  }
  return nowMins >= startMins || nowMins < endMins;
}
