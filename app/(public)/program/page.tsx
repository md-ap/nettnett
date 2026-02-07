"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */
interface WeeklyEntry {
  playlistId: number;
  playlistName: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  days: number[]; // 0=Sun, 1=Mon...6=Sat
  startDate?: string;
  endDate?: string;
  loopOnce?: boolean;
}

interface ScheduleEntry {
  id: number;
  type: string;
  name: string;
  title: string;
  description: string;
  start_timestamp: number;
  end_timestamp: number;
  start: string;
  end: string;
  is_now: boolean;
}

/* ─── Constants ─── */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/* ─── Helpers ─── */
function formatTime24(time: string): string {
  const parts = time.split(":");
  return `${parts[0]}:${parts[1]}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function isNowInRange(startTime: string, endTime: string, dayNum: number): boolean {
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

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startStr = `${months[weekStart.getMonth()]} ${weekStart.getDate()}`;
  const endStr = `${weekStart.getMonth() !== end.getMonth() ? months[end.getMonth()] + " " : ""}${end.getDate()}, ${end.getFullYear()}`;
  return `${startStr} – ${endStr}`;
}

function formatDayFull(weekStart: Date, dayIdx: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIdx);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${dayNames[dayIdx]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDayDate(weekStart: Date, dayIdx: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIdx);
  return `${d.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getColor(id: number): string {
  const colors = [
    "border-blue-500/30 bg-blue-500/10",
    "border-purple-500/30 bg-purple-500/10",
    "border-green-500/30 bg-green-500/10",
    "border-orange-500/30 bg-orange-500/10",
    "border-pink-500/30 bg-pink-500/10",
    "border-cyan-500/30 bg-cyan-500/10",
  ];
  return colors[id % colors.length];
}

export default function ProgramPage() {
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyEntry[]>([]);
  const [azuraSchedule, setAzuraSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [viewMode, setViewMode] = useState<"week" | "day">("day");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/radio/schedule", { cache: "no-store" });
      const data = await res.json();
      setWeeklySchedule(Array.isArray(data.weeklySchedule) ? data.weeklySchedule : []);
      setAzuraSchedule(Array.isArray(data.schedule) ? data.schedule : []);
    } catch {
      // Keep empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 60000);
    return () => clearInterval(interval);
  }, [fetchSchedule]);

  const today = new Date();
  const todayDay = today.getDay();
  const isCurrentWeek = isSameDay(currentWeekStart, getWeekStart(today));

  // Get the actual date for a day-of-week in the currently viewed week
  function getDateForDay(dayIdx: number): Date {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + dayIdx);
    return d;
  }

  // Check if an event with startDate/endDate should appear on a specific date
  function isEventActiveOnDate(entry: WeeklyEntry, date: Date): boolean {
    if (!entry.days.includes(date.getDay())) return false;
    // If event has date range limits, check them
    if (entry.startDate) {
      const start = new Date(entry.startDate + "T00:00:00");
      if (date < start) return false;
    }
    if (entry.endDate) {
      const end = new Date(entry.endDate + "T23:59:59");
      if (date > end) return false;
    }
    return true;
  }

  // Get events for a specific day in the current viewed week
  function eventsForDay(day: number) {
    const date = getDateForDay(day);
    return weeklySchedule
      .filter((e) => isEventActiveOnDate(e, date))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }

  function azuraEventsForDay(day: number) {
    const date = getDateForDay(day);
    return azuraSchedule
      .filter((e) => {
        try {
          const eventDate = new Date(e.start);
          return eventDate.getDay() === day && isSameDay(eventDate, date);
        } catch { return false; }
      })
      .sort((a, b) => a.start_timestamp - b.start_timestamp);
  }

  function dayHasEvents(day: number): boolean {
    const date = getDateForDay(day);
    return weeklySchedule.some((e) => isEventActiveOnDate(e, date)) ||
      azuraSchedule.some((e) => {
        try {
          const eventDate = new Date(e.start);
          return eventDate.getDay() === day && isSameDay(eventDate, date);
        } catch { return false; }
      });
  }

  /* ─── Render an event card ─── */
  function renderWeeklyEvent(entry: WeeklyEntry, idx: number, day: number, compact = false) {
    // "NOW PLAYING" only shows when it's actually today and currently within the time range
    const isLive = isNowInRange(entry.startTime, entry.endTime, day) && isCurrentWeek;
    const startTime = formatTime24(entry.startTime);
    const endTime = formatTime24(entry.endTime);
    const color = getColor(entry.playlistId);

    if (compact) {
      // Week view: compact card
      return (
        <div
          key={`${entry.playlistId}-${idx}`}
          className={`rounded border p-2 text-xs ${color} ${
            isLive ? "ring-1 ring-green-400/40" : ""
          }`}
        >
          <p className="font-mono text-[10px] text-white/50">
            {startTime} – {endTime}
          </p>
          <p className="mt-0.5 font-medium truncate text-white/90">
            {entry.playlistName}
          </p>
          {isLive && (
            <div className="mt-1 flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-green-400">NOW</span>
            </div>
          )}
        </div>
      );
    }

    // Day view: full card with timeline
    return (
      <div key={`${entry.playlistId}-${idx}`} className="relative flex gap-4 pb-6">
        <div className="relative z-10 mt-1 flex-shrink-0">
          {isLive ? (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400" />
            </span>
          ) : (
            <span className="inline-flex h-3 w-3 rounded-full border-2 border-white/30 bg-black" />
          )}
        </div>
        <div
          className={`flex-1 rounded-lg border p-4 transition-colors ${color} ${
            isLive ? "ring-1 ring-green-400/40" : ""
          }`}
        >
          <p className="text-xs font-mono text-white/50">
            {startTime} — {endTime}
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {entry.playlistName}
          </h3>
          {(entry.startDate || entry.endDate) && (
            <p className="mt-1 text-xs text-white/40">
              {entry.startDate || "..."} → {entry.endDate || "..."}
              {entry.loopOnce && " (plays once)"}
            </p>
          )}
          {isLive && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] font-medium text-green-400">NOW PLAYING</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderAzuraEvent(entry: ScheduleEntry, idx: number, compact = false) {
    const isLive = entry.is_now;
    const displayName = entry.name || entry.title || "Untitled";
    const color = getColor(entry.id);
    let startTime = "";
    let endTime = "";
    try {
      startTime = new Date(entry.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      endTime = new Date(entry.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      startTime = entry.start;
      endTime = entry.end;
    }

    if (compact) {
      return (
        <div
          key={`${entry.id}-${idx}`}
          className={`rounded border p-2 text-xs ${color} ${
            isLive ? "ring-1 ring-green-400/40" : ""
          }`}
        >
          <p className="font-mono text-[10px] text-white/50">
            {startTime} – {endTime}
          </p>
          <p className="mt-0.5 font-medium truncate text-white/90">
            {displayName}
          </p>
          {isLive && (
            <div className="mt-1 flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-green-400">NOW</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={`${entry.id}-${idx}`} className="relative flex gap-4 pb-6">
        <div className="relative z-10 mt-1 flex-shrink-0">
          {isLive ? (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400" />
            </span>
          ) : (
            <span className="inline-flex h-3 w-3 rounded-full border-2 border-white/30 bg-black" />
          )}
        </div>
        <div
          className={`flex-1 rounded-lg border p-4 transition-colors ${color} ${
            isLive ? "ring-1 ring-green-400/40" : ""
          }`}
        >
          <p className="text-xs font-mono text-white/50">
            {startTime} — {endTime}
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {displayName}
          </h3>
          {entry.description && (
            <p className="mt-1 text-sm text-white/50 leading-relaxed line-clamp-2">{entry.description}</p>
          )}
          {isLive && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] font-medium text-green-400">NOW PLAYING</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* Header */}
      <h1 className="text-3xl font-bold mb-2">Program</h1>
      <p className="text-white/40 text-sm mb-6">Weekly broadcast schedule</p>

      {/* Navigation bar: arrows + date range + view toggle */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 mb-6">
        {/* Navigation arrows: day-by-day in DAY mode, week-by-week in WEEK mode */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (viewMode === "day") {
                // Navigate to previous day
                const newDay = selectedDay === 0 ? 6 : selectedDay - 1;
                // If going from Sunday to Saturday, go back one week
                if (selectedDay === 0) {
                  const prev = new Date(currentWeekStart);
                  prev.setDate(prev.getDate() - 7);
                  setCurrentWeekStart(prev);
                }
                setSelectedDay(newDay);
              } else {
                const prev = new Date(currentWeekStart);
                prev.setDate(prev.getDate() - 7);
                setCurrentWeekStart(prev);
              }
            }}
            className="rounded p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title={viewMode === "day" ? "Previous day" : "Previous week"}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (viewMode === "day") {
                // Navigate to next day
                const newDay = selectedDay === 6 ? 0 : selectedDay + 1;
                // If going from Saturday to Sunday, go forward one week
                if (selectedDay === 6) {
                  const next = new Date(currentWeekStart);
                  next.setDate(next.getDate() + 7);
                  setCurrentWeekStart(next);
                }
                setSelectedDay(newDay);
              } else {
                const next = new Date(currentWeekStart);
                next.setDate(next.getDate() + 7);
                setCurrentWeekStart(next);
              }
            }}
            className="rounded p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title={viewMode === "day" ? "Next day" : "Next week"}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {!(isCurrentWeek && selectedDay === todayDay) && (
            <button
              onClick={() => {
                setCurrentWeekStart(getWeekStart(new Date()));
                setSelectedDay(new Date().getDay());
              }}
              className="ml-1 rounded border border-white/10 px-2.5 py-1 text-xs text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              Today
            </button>
          )}
        </div>

        {/* Date range */}
        <span className="text-sm font-medium text-white/70 hidden sm:block">
          {viewMode === "week"
            ? formatWeekRange(currentWeekStart)
            : formatDayFull(currentWeekStart, selectedDay)
          }
        </span>
        <span className="text-sm font-medium text-white/70 sm:hidden">
          {viewMode === "week"
            ? formatWeekRange(currentWeekStart)
            : `${DAY_LABELS[selectedDay]} ${formatDayDate(currentWeekStart, selectedDay)}`
          }
        </span>

        {/* View toggle */}
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "week" ? "bg-white/15 text-white" : "text-white/30 hover:text-white/50"
            }`}
          >
            WEEK
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "day" ? "bg-white/15 text-white" : "text-white/30 hover:text-white/50"
            }`}
          >
            DAY
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      ) : viewMode === "week" ? (
        /* ─── WEEK VIEW: Grid with all 7 days ─── */
        <div>
          {/* Day column headers */}
          <div className="grid grid-cols-7 gap-2 mb-3">
            {DAY_LABELS.map((label, i) => {
              const isToday = isCurrentWeek && i === todayDay;
              const hasEvents = dayHasEvents(i);
              return (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedDay(i);
                    setViewMode("day");
                  }}
                  className={`text-center py-2 rounded-lg transition-colors cursor-pointer hover:bg-white/5 relative ${
                    isToday ? "text-white" : "text-white/40"
                  }`}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className={`text-[10px] ${isToday ? "text-white/60" : "text-white/20"}`}>
                    {formatDayDate(currentWeekStart, i)}
                  </div>
                  {hasEvents && (
                    <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-blue-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Day columns with events */}
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, dayIdx) => {
              const weekly = eventsForDay(dayIdx);
              const azura = azuraEventsForDay(dayIdx);
              const hasWeekly = weekly.length > 0;

              return (
                <div key={dayIdx} className="min-h-[80px] space-y-1.5">
                  {hasWeekly ? (
                    weekly.map((entry, idx) => renderWeeklyEvent(entry, idx, dayIdx, true))
                  ) : azura.length > 0 ? (
                    azura.map((entry, idx) => renderAzuraEvent(entry, idx, true))
                  ) : (
                    <div className="rounded border border-white/5 bg-white/[0.02] p-2 text-center">
                      <p className="text-[10px] text-white/15">—</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ─── DAY VIEW: Timeline with full cards ─── */
        (() => {
          const dayEvents = eventsForDay(selectedDay);
          const azuraDayEvents = azuraEventsForDay(selectedDay);
          const hasWeeklyData = dayEvents.length > 0;

          if (hasWeeklyData) {
            return (
              <div className="relative">
                <div className="absolute left-[23px] top-4 bottom-4 w-px bg-white/10" />
                <div className="space-y-0">
                  {dayEvents.map((entry, idx) => renderWeeklyEvent(entry, idx, selectedDay))}
                </div>
              </div>
            );
          } else if (azuraDayEvents.length > 0) {
            return (
              <div className="relative">
                <div className="absolute left-[23px] top-4 bottom-4 w-px bg-white/10" />
                <div className="space-y-0">
                  {azuraDayEvents.map((entry, idx) => renderAzuraEvent(entry, idx))}
                </div>
              </div>
            );
          } else {
            return (
              <div className="rounded-lg border border-white/10 bg-white/5 px-6 py-12 text-center">
                <svg className="mx-auto mb-3 h-8 w-8 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <p className="text-sm text-white/40">No scheduled programs for {DAY_LABELS[selectedDay]}</p>
              </div>
            );
          }
        })()
      )}

      {/* Footer info */}
      <div className="mt-8 text-center">
        <p className="text-xs text-white/25">
          Between scheduled shows, our auto-DJ plays from the library.
        </p>
      </div>
    </div>
  );
}
