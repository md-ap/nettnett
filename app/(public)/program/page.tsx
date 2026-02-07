"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */
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

function formatScheduleTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return dateStr;
  }
}

function isSameDay(dateStr: string, targetDay: number): boolean {
  try {
    const d = new Date(dateStr);
    return d.getDay() === targetDay;
  } catch {
    return false;
  }
}

export default function ProgramPage() {
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [playlistNames, setPlaylistNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/radio/schedule", { cache: "no-store" });
      const data = await res.json();
      setSchedule(Array.isArray(data.schedule) ? data.schedule : []);
      setPlaylistNames(data.playlistNames || {});
    } catch {
      // Keep empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    // Refresh every 60 seconds to update "now" status
    const interval = setInterval(fetchSchedule, 60000);
    return () => clearInterval(interval);
  }, [fetchSchedule]);

  // Filter events for the selected day
  const dayEvents = schedule
    .filter((entry) => isSameDay(entry.start, selectedDay))
    .sort((a, b) => a.start_timestamp - b.start_timestamp);

  const today = new Date().getDay();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/* Header */}
      <h1 className="text-3xl font-bold mb-2">Program</h1>
      <p className="text-white/40 text-sm mb-8">Weekly broadcast schedule</p>

      {/* Day selector */}
      <div className="flex gap-1 mb-8">
        {DAY_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => setSelectedDay(i)}
            className={`flex-1 rounded-lg py-2.5 text-center text-sm font-medium transition-colors ${
              selectedDay === i
                ? "bg-white/10 text-white"
                : i === today
                  ? "text-white/60 border border-white/20"
                  : "text-white/30 hover:text-white/50"
            }`}
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.charAt(0)}</span>
          </button>
        ))}
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      ) : dayEvents.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-6 py-12 text-center">
          <svg className="mx-auto mb-3 h-8 w-8 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-sm text-white/40">No scheduled programs for {DAY_LABELS[selectedDay]}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[23px] top-4 bottom-4 w-px bg-white/10" />

          <div className="space-y-0">
            {dayEvents.map((entry, idx) => {
              const isActive = entry.is_now;
              const displayName = entry.name || entry.title || playlistNames[entry.id] || "Untitled";
              const startTime = formatScheduleTime(entry.start);
              const endTime = formatScheduleTime(entry.end);

              return (
                <div key={`${entry.id}-${idx}`} className="relative flex gap-4 pb-6">
                  {/* Timeline dot */}
                  <div className="relative z-10 mt-1 flex-shrink-0">
                    {isActive ? (
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400" />
                      </span>
                    ) : (
                      <span className="inline-flex h-3 w-3 rounded-full border-2 border-white/20 bg-black" />
                    )}
                  </div>

                  {/* Event card */}
                  <div
                    className={`flex-1 rounded-lg border p-4 transition-colors ${
                      isActive
                        ? "border-white/30 bg-white/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    {/* Time */}
                    <p className={`text-xs font-mono ${isActive ? "text-white/60" : "text-white/30"}`}>
                      {startTime} — {endTime}
                    </p>

                    {/* Title */}
                    <h3 className={`mt-1 text-base font-semibold ${isActive ? "text-white" : "text-white/80"}`}>
                      {displayName}
                    </h3>

                    {/* Description */}
                    {entry.description && (
                      <p className="mt-1 text-sm text-white/40 leading-relaxed line-clamp-2">
                        {entry.description}
                      </p>
                    )}

                    {/* NOW badge */}
                    {isActive && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-[11px] font-medium text-green-400">NOW PLAYING</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
