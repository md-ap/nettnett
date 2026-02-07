"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */
interface ScheduleItem {
  id?: number;
  start_time: string | number; // AzuraCast returns integer (900=09:00), our UI uses "HH:MM"
  end_time: string | number;
  days: number[];
  start_date?: string;
  end_date?: string;
  loop_once?: boolean;
}

interface Playlist {
  id: number;
  name: string;
  is_enabled: boolean;
  type: string;
  weight: number;
  total_length?: number; // total duration in seconds (from AzuraCast)
  num_songs?: number;
  schedule_items?: ScheduleItem[];
  backend_options?: string[]; // e.g. ["interrupt", "single_track", "merge"]
}

interface MediaFile {
  id: number;
  unique_id: string;
  song_id: string;
  title: string;
  artist: string;
  path: string;
  length: number;
  playlists: { id: number; name: string }[];
}

type SourceType = "playlist" | "media";

interface ScheduleBlock {
  playlistId: number;
  playlistName: string;
  itemIndex: number;
  startTime: string;
  endTime: string;
  days: number[];
  startDate?: string;
  endDate?: string;
  loopOnce?: boolean;
  backendOptions?: string[];
}

/* ─── Constants ─── */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const COLORS = [
  "bg-blue-500/30 border-blue-500/50 text-blue-300",
  "bg-purple-500/30 border-purple-500/50 text-purple-300",
  "bg-green-500/30 border-green-500/50 text-green-300",
  "bg-orange-500/30 border-orange-500/50 text-orange-300",
  "bg-pink-500/30 border-pink-500/50 text-pink-300",
  "bg-cyan-500/30 border-cyan-500/50 text-cyan-300",
  "bg-yellow-500/30 border-yellow-500/50 text-yellow-300",
  "bg-red-500/30 border-red-500/50 text-red-300",
];

function getColor(id: number) {
  return COLORS[id % COLORS.length];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${h}:${m}`;
}

function addSecondsToTime(time: string, seconds: number): string {
  const mins = timeToMinutes(time) + Math.ceil(seconds / 60);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/* ─── Week helpers ─── */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day); // go to Sunday
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

function formatDayDate(weekStart: Date, dayIdx: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIdx);
  return `${d.getDate()}`;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
}

export default function ScheduleCalendar() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

  // View mode and week navigation
  const [viewMode, setViewMode] = useState<"week" | "day">("day");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));

  // Media files for single-file scheduling
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [formSourceType, setFormSourceType] = useState<SourceType>("playlist");
  const [formPlaylistId, setFormPlaylistId] = useState<number>(0);
  const [formMediaFileId, setFormMediaFileId] = useState<string>("");
  const [formStartTime, setFormStartTime] = useState("00:00");
  const [formEndTime, setFormEndTime] = useState("01:00");
  const [formDays, setFormDays] = useState<number[]>([]);
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formLoopOnce, setFormLoopOnce] = useState(false);
  const [formRecurring, setFormRecurring] = useState(false); // default: one-time event
  const [formInterrupt, setFormInterrupt] = useState(true); // default ON for scheduled playlists

  /* ─── Fetch playlists, media files, and build schedule blocks ─── */
  const fetchData = useCallback(async () => {
    try {
      const [playlistRes, filesRes] = await Promise.all([
        fetch("/api/radio?endpoint=playlists", { cache: "no-store" }),
        fetch("/api/radio?endpoint=files", { cache: "no-store" }),
      ]);
      const data = await playlistRes.json();
      const filesData = await filesRes.json();
      if (!Array.isArray(data)) return;

      // The playlists list already includes total_length and num_songs
      setPlaylists(data);
      if (Array.isArray(filesData)) setMediaFiles(filesData);

      // Fetch details for ALL playlists to find schedule_items
      // (not just type==="scheduled" — AzuraCast may use different type values)
      const detailPromises = data.map(async (p: Playlist) => {
        try {
          const detailRes = await fetch(`/api/radio?endpoint=playlist/${p.id}`, { cache: "no-store" });
          return detailRes.json();
        } catch {
          return null;
        }
      });

      const details = await Promise.all(detailPromises);
      const allBlocks: ScheduleBlock[] = [];

      for (const detail of details) {
        if (!detail) continue;
        if (detail.schedule_items && Array.isArray(detail.schedule_items) && detail.schedule_items.length > 0) {
          detail.schedule_items.forEach((item: ScheduleItem, index: number) => {
            // AzuraCast stores time as integer (e.g. 900=09:00, 2230=22:30)
            // Convert to "HH:MM" string for our UI
            const fromTimeInt = (t: string | number): string => {
              if (typeof t === "string" && t.includes(":")) return t; // already HH:MM
              const n = typeof t === "string" ? parseInt(t) : t;
              const h = Math.floor(n / 100);
              const m = n % 100;
              return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            };
            // AzuraCast uses ISO days (1=Mon..7=Sun) → convert to JS days (0=Sun..6=Sat)
            const fromIsoDays = (isoDays: number[]): number[] =>
              (isoDays || []).map((d) => (d === 7 ? 0 : d));

            allBlocks.push({
              playlistId: detail.id,
              playlistName: detail.name,
              itemIndex: index,
              startTime: fromTimeInt(item.start_time),
              endTime: fromTimeInt(item.end_time),
              days: fromIsoDays(item.days),
              startDate: item.start_date || undefined,
              endDate: item.end_date || undefined,
              loopOnce: item.loop_once || false,
              backendOptions: detail.backend_options || [],
            });
          });
        }
      }

      setBlocks(allBlocks);
    } catch {
      setError("Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ─── Get fallback playlist (highest weight enabled playlist WITHOUT schedule_items) ─── */
  const scheduledPlaylistIds = new Set(blocks.map((b) => b.playlistId));
  const fallbackPlaylist = playlists
    .filter((p) => p.is_enabled && !scheduledPlaylistIds.has(p.id))
    .sort((a, b) => b.weight - a.weight)[0];

  /* ─── Auto-calculate end time based on content duration ─── */
  function autoCalcEndTime(startTime: string, sourceType: SourceType, playlistId?: number, mediaFileId?: string) {
    let durationSecs = 0;
    if (sourceType === "playlist" && playlistId) {
      const pl = playlists.find((p) => p.id === playlistId);
      if (pl?.total_length) durationSecs = pl.total_length;
    } else if (sourceType === "media" && mediaFileId) {
      const file = mediaFiles.find((f) => f.unique_id === mediaFileId);
      if (file?.length) durationSecs = file.length;
    }
    if (durationSecs > 0) {
      setFormEndTime(addSecondsToTime(startTime, durationSecs));
    }
  }

  /* ─── Get duration info for display ─── */
  function getSelectedDuration(): number {
    if (formSourceType === "playlist" && formPlaylistId) {
      const pl = playlists.find((p) => p.id === formPlaylistId);
      return pl?.total_length || 0;
    } else if (formSourceType === "media" && formMediaFileId) {
      const file = mediaFiles.find((f) => f.unique_id === formMediaFileId);
      return file?.length || 0;
    }
    return 0;
  }

  /* ─── Modal helpers ─── */
  function openAddModal() {
    setEditingBlock(null);
    setFormSourceType("playlist");
    const firstPlaylist = playlists[0];
    setFormPlaylistId(firstPlaylist?.id || 0);
    setFormMediaFileId("");
    setMediaSearch("");
    setFormStartTime("00:00");
    // Auto-calc end time from first playlist duration
    if (firstPlaylist?.total_length) {
      setFormEndTime(addSecondsToTime("00:00", firstPlaylist.total_length));
    } else {
      setFormEndTime("01:00");
    }
    setFormDays([selectedDay]);
    setFormRecurring(false); // default to one-time event
    // Auto-fill date for one-time event
    const dateStr = computeDateForDay(selectedDay);
    setFormStartDate(dateStr);
    setFormEndDate(dateStr);
    setFormLoopOnce(false);
    setFormInterrupt(true); // default to interrupt for new scheduled blocks
    setShowModal(true);
  }

  function openEditModal(block: ScheduleBlock) {
    setEditingBlock(block);
    setFormSourceType("playlist");
    setFormPlaylistId(block.playlistId);
    setFormMediaFileId("");
    setMediaSearch("");
    setFormStartTime(block.startTime);
    setFormEndTime(block.endTime);
    setFormDays([...block.days]);
    const isRecurring = !block.startDate && !block.endDate;
    setFormRecurring(isRecurring);
    // For recurring events without a start date, compute one from the day for the date picker
    const startDate = block.startDate || (block.days.length > 0 ? computeDateForDay(block.days[0]) : "");
    setFormStartDate(startDate);
    setFormEndDate(isRecurring ? "" : (block.endDate || startDate));
    setFormLoopOnce(block.loopOnce || false);
    setFormInterrupt(block.backendOptions?.includes("interrupt") ?? true);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBlock(null);
    setFormSourceType("playlist");
    setMediaSearch("");
    setFormRecurring(false);
    setFormStartDate("");
    setFormEndDate("");
    setFormLoopOnce(false);
    setFormInterrupt(true);
    setError("");
  }

  function computeDateForDay(targetDay: number): string {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + targetDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) date.setDate(date.getDate() + 7);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  /* ─── Save schedule block ─── */
  async function handleSave() {
    if (!formStartDate || formDays.length === 0) {
      setError("Select a date");
      return;
    }
    if (formStartTime === formEndTime) {
      setError("Start and end time cannot be the same");
      return;
    }
    if (formSourceType === "media" && !formMediaFileId) {
      setError("Select a media file");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let targetPlaylistId = formPlaylistId;

      // If scheduling a media file, auto-create a playlist for it
      if (formSourceType === "media" && formMediaFileId) {
        const file = mediaFiles.find((f) => f.unique_id === formMediaFileId);
        const playlistName = `[Scheduled] ${file?.title || file?.artist || "Media"}`;

        // Create the playlist (already enabled)
        const createRes = await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create-playlist", name: playlistName, is_enabled: true }),
        });
        const created = await createRes.json();
        targetPlaylistId = created.id;

        // Add the media file to the playlist
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add-to-playlist",
            playlistId: targetPlaylistId,
            mediaPath: file?.path || formMediaFileId,
          }),
        });
      }

      // Fetch current playlist details to get existing schedule_items
      const detailRes = await fetch(`/api/radio?endpoint=playlist/${targetPlaylistId}`, { cache: "no-store" });
      const detail = await detailRes.json();
      const existingItems: ScheduleItem[] = detail.schedule_items || [];

      // Ensure the playlist is enabled — a disabled playlist won't play even with schedule
      if (!detail.is_enabled) {
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "playlist-toggle", playlistId: targetPlaylistId }),
        });
      }

      // Build the new schedule item
      // For media file source, always force loop_once to prevent repeating after schedule ends
      const effectiveLoopOnce = formSourceType === "media" ? true : formLoopOnce;

      // Compute effective dates based on recurring toggle
      let effectiveStartDate = formStartDate;
      let effectiveEndDate = "";
      if (formRecurring) {
        // Recurring: start_date from picker, end_date only if "repeat until" is set
        effectiveStartDate = formStartDate;
        effectiveEndDate = formEndDate; // empty = forever
      } else {
        // One-time: both dates = same day
        effectiveStartDate = formStartDate;
        effectiveEndDate = formStartDate;
        // Fallback if somehow empty
        if (!effectiveStartDate && formDays.length > 0) {
          const dateStr = computeDateForDay(formDays[0]);
          effectiveStartDate = dateStr;
          effectiveEndDate = dateStr;
        }
      }

      const newItem: ScheduleItem = {
        start_time: formStartTime,
        end_time: formEndTime,
        days: formDays,
      };
      if (effectiveStartDate) newItem.start_date = effectiveStartDate;
      if (effectiveEndDate) newItem.end_date = effectiveEndDate;
      if (effectiveLoopOnce) newItem.loop_once = true;

      let newItems: ScheduleItem[];

      if (editingBlock && editingBlock.playlistId === targetPlaylistId) {
        // Editing existing item on the same playlist — replace at index
        newItems = existingItems.map((item: ScheduleItem, idx: number) =>
          idx === editingBlock.itemIndex ? newItem : item
        );
      } else if (editingBlock && editingBlock.playlistId !== targetPlaylistId) {
        // Moved to a different playlist — remove from old, add to new
        await removeScheduleItem(editingBlock.playlistId, editingBlock.itemIndex);
        newItems = [...existingItems, newItem];
      } else {
        // Adding a new item
        newItems = [...existingItems, newItem];
      }

      // Build backend_options array based on user selections
      const backendOptions: string[] = [];
      if (formInterrupt) backendOptions.push("interrupt");

      const scheduleRes = await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule-playlist",
          playlistId: targetPlaylistId,
          scheduleItems: newItems,
          backendOptions,
        }),
      });

      if (!scheduleRes.ok) {
        const errData = await scheduleRes.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || "Failed to save schedule");
      }

      // Restart backend so Liquidsoap reloads playlists and detects the new schedule
      // Without this, the schedule may show in AzuraCast UI but Liquidsoap won't switch
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      }).catch(() => {}); // non-critical: don't fail if restart has a hiccup

      closeModal();
      await fetchData();
    } catch {
      setError("Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Delete schedule block ─── */
  async function handleDelete() {
    if (!editingBlock) return;
    setSaving(true);
    setError("");

    try {
      await removeScheduleItem(editingBlock.playlistId, editingBlock.itemIndex);

      // Restart backend so Liquidsoap reloads after schedule removal
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      }).catch(() => {});

      closeModal();
      await fetchData();
    } catch {
      setError("Failed to delete schedule block");
    } finally {
      setSaving(false);
    }
  }

  async function removeScheduleItem(playlistId: number, itemIndex: number) {
    const detailRes = await fetch(`/api/radio?endpoint=playlist/${playlistId}`, { cache: "no-store" });
    const detail = await detailRes.json();
    const existingItems: ScheduleItem[] = detail.schedule_items || [];
    const newItems = existingItems.filter((_: ScheduleItem, idx: number) => idx !== itemIndex);

    if (newItems.length === 0) {
      // No more schedule items
      if (detail.name?.startsWith("[Scheduled]")) {
        // Auto-created playlist — delete it entirely so it doesn't enter general rotation
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete-playlist",
            playlistId,
          }),
        });
      } else {
        // User-created playlist — just remove schedule items and disable
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unschedule-playlist",
            playlistId,
          }),
        });
        // Disable the playlist so it doesn't play in general rotation without a schedule
        if (detail.is_enabled) {
          await fetch("/api/radio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "playlist-toggle", playlistId }),
          });
        }
      }
    } else {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule-playlist",
          playlistId,
          scheduleItems: newItems,
        }),
      });
    }
  }

  /* ─── Get the actual date for a day-of-week in the current viewed week ─── */
  function getDateForDay(dayIdx: number): Date {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + dayIdx);
    return d;
  }

  /* ─── Get blocks for a specific day, respecting date range limits ─── */
  function blocksForDay(day: number): ScheduleBlock[] {
    const date = getDateForDay(day);
    return blocks
      .filter((b) => {
        if (!b.days.includes(day)) return false;
        // If block has date range limits, check them
        if (b.startDate) {
          const start = new Date(b.startDate + "T00:00:00");
          if (date < start) return false;
        }
        if (b.endDate) {
          const end = new Date(b.endDate + "T23:59:59");
          if (date > end) return false;
        }
        return true;
      })
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }

  /* ─── Check if current time is within a block ─── */
  function isNow(block: ScheduleBlock): boolean {
    const now = new Date();
    const today = now.getDay();
    if (!block.days.includes(today)) return false;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = timeToMinutes(block.startTime);
    const endMins = timeToMinutes(block.endTime);
    if (endMins > startMins) {
      return nowMins >= startMins && nowMins < endMins;
    }
    // Overnight block (e.g., 22:00 - 02:00)
    return nowMins >= startMins || nowMins < endMins;
  }

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-white/50">
            Schedule
          </h2>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Block
          </button>
        </div>

        {/* Navigation bar: arrows + date range + view toggle */}
        <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1.5">
          {/* Navigation arrows: day-by-day in DAY mode, week-by-week in WEEK mode */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                if (viewMode === "day") {
                  const newDay = selectedDay === 0 ? 6 : selectedDay - 1;
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
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (viewMode === "day") {
                  const newDay = selectedDay === 6 ? 0 : selectedDay + 1;
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
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {/* Today button — show when not on today */}
            {!(isSameDay(currentWeekStart, getWeekStart(new Date())) && selectedDay === new Date().getDay()) && (
              <button
                onClick={() => {
                  setCurrentWeekStart(getWeekStart(new Date()));
                  setSelectedDay(new Date().getDay());
                }}
                className="ml-1 rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                Today
              </button>
            )}
          </div>

          {/* Date range label */}
          <span className="text-sm font-medium text-white/70">
            {viewMode === "week"
              ? formatWeekRange(currentWeekStart)
              : (() => {
                  const d = new Date(currentWeekStart);
                  d.setDate(d.getDate() + selectedDay);
                  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                  return `${dayNames[selectedDay]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                })()
            }
          </span>

          {/* View toggle */}
          <div className="flex overflow-hidden rounded border border-white/10">
            <button
              onClick={() => setViewMode("week")}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                viewMode === "week"
                  ? "bg-white/15 text-white"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              WEEK
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                viewMode === "day"
                  ? "bg-white/15 text-white"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              DAY
            </button>
          </div>
        </div>
      </div>

      {/* Desktop: Weekly or Day grid — uses page scroll, no internal scroll */}
      <div className="hidden md:block">
        {(() => {
          const today = new Date();
          const todayDay = today.getDay();
          const isCurrentWeek = isSameDay(currentWeekStart, getWeekStart(today));
          const daysToShow = viewMode === "week"
            ? Array.from({ length: 7 }, (_, i) => i)
            : [selectedDay];
          const colCount = daysToShow.length;

          return (
            <>
              {/* Day headers */}
              <div className={`grid border-b border-white/10`} style={{ gridTemplateColumns: `50px repeat(${colCount}, 1fr)` }}>
                <div />
                {daysToShow.map((dayIdx) => {
                  const isToday = isCurrentWeek && dayIdx === todayDay;
                  return (
                    <button
                      key={dayIdx}
                      onClick={() => {
                        if (viewMode === "week") {
                          setSelectedDay(dayIdx);
                          setViewMode("day");
                        }
                      }}
                      className={`py-2 text-center text-xs font-medium transition-colors ${
                        isToday ? "text-white" : "text-white/40"
                      } ${viewMode === "week" ? "hover:text-white/70 cursor-pointer" : ""}`}
                    >
                      <div>{DAY_LABELS[dayIdx]}</div>
                      <div className={`text-[10px] ${isToday ? "text-white/60" : "text-white/20"}`}>
                        {formatDayDate(currentWeekStart, dayIdx)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* No day selector bar in DAY mode — arrows handle day-by-day navigation */}

              {/* Time grid — full height, no internal scroll */}
              <div className="relative" style={{ height: `${24 * 28}px` }}>
                {/* Hour lines + labels */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-b border-white/5"
                    style={{ top: `${h * 28}px`, height: "28px" }}
                  >
                    <span className="absolute left-0 top-1 w-[50px] pr-2 text-right text-[10px] text-white/25">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}

                {/* Day columns with schedule blocks */}
                {daysToShow.map((dayIdx, colIdx) => {
                  const colLeft = `calc(50px + ${colIdx} * ((100% - 50px) / ${colCount}))`;
                  const colWidth = `calc((100% - 50px) / ${colCount})`;

                  return (
                    <div
                      key={dayIdx}
                      className="absolute top-0 bottom-0"
                      style={{ left: colLeft, width: colWidth }}
                    >
                      {blocksForDay(dayIdx).map((block, blockIdx) => {
                        const startMins = timeToMinutes(block.startTime);
                        const endMins = timeToMinutes(block.endTime);
                        const duration = endMins > startMins ? endMins - startMins : (1440 - startMins) + endMins;
                        const top = (startMins / 1440) * (24 * 28);
                        const height = Math.max((duration / 1440) * (24 * 28), 14);
                        const color = getColor(block.playlistId);
                        const active = isNow(block);

                        return (
                          <button
                            key={`${block.playlistId}-${block.itemIndex}-${blockIdx}`}
                            onClick={() => openEditModal(block)}
                            className={`absolute inset-x-0.5 rounded border px-1 py-0.5 text-left transition-opacity hover:opacity-80 ${color} ${
                              active ? "ring-1 ring-white/30" : ""
                            }`}
                            style={{ top: `${top}px`, height: `${height}px` }}
                            title={`${block.playlistName} (${formatTime(block.startTime)} - ${formatTime(block.endTime)})${block.startDate || block.endDate ? ` [${block.startDate || "..."} → ${block.endDate || "..."}]` : ""}`}
                          >
                            <div className="truncate text-[10px] font-medium leading-tight">
                              {block.playlistName}
                            </div>
                            {height > 20 && (
                              <div className="truncate text-[9px] opacity-70">
                                {formatTime(block.startTime)} - {formatTime(block.endTime)}
                              </div>
                            )}
                            {active && (
                              <span className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      {/* Mobile: Day selector + single day view */}
      <div className="md:hidden space-y-4">
        {/* Day selector */}
        <div className="flex gap-1">
          {DAY_LABELS_SHORT.map((label, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`flex-1 rounded py-2 text-center text-xs font-medium transition-colors ${
                selectedDay === i
                  ? "bg-white/10 text-white"
                  : i === new Date().getDay()
                    ? "text-white/60 border border-white/20"
                    : "text-white/30 hover:text-white/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Day blocks */}
        <div className="space-y-2">
          {blocksForDay(selectedDay).length === 0 ? (
            <div className="rounded border border-white/10 bg-white/5 px-4 py-8 text-center">
              <p className="text-sm text-white/40">No scheduled programs for {DAY_LABELS[selectedDay]}</p>
            </div>
          ) : (
            blocksForDay(selectedDay).map((block, idx) => {
              const color = getColor(block.playlistId);
              const active = isNow(block);
              return (
                <button
                  key={`${block.playlistId}-${block.itemIndex}-${idx}`}
                  onClick={() => openEditModal(block)}
                  className={`w-full rounded border p-3 text-left transition-opacity hover:opacity-80 ${color} ${
                    active ? "ring-1 ring-white/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{block.playlistName}</span>
                    {active && (
                      <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        NOW
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    {formatTime(block.startTime)} - {formatTime(block.endTime)}
                    {(block.startDate || block.endDate) && (
                      <span className="ml-2 opacity-60">
                        {block.startDate || "..."} → {block.endDate || "..."}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Fallback indicator */}
      <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-xs text-white/40">
          <span className="text-white/60 font-medium">Fallback:</span>{" "}
          When no scheduled playlist is active, the auto-DJ plays{" "}
          {fallbackPlaylist ? (
            <span className="text-white/70">&quot;{fallbackPlaylist.name}&quot; (weight: {fallbackPlaylist.weight})</span>
          ) : (
            <span className="text-white/50">from the media library</span>
          )}
        </p>
      </div>

      {/* ─── Add/Edit Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              {editingBlock ? "Edit Schedule Block" : "Add Schedule Block"}
            </h3>

            {error && (
              <div className="mb-4 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Source type toggle */}
            {!editingBlock && (
              <div className="mb-4">
                <label className="mb-2 block text-xs text-white/50">Source</label>
                <div className="flex rounded border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setFormSourceType("playlist");
                      setFormLoopOnce(false); // Playlists typically loop through their songs
                      // Recalc end time from playlist duration
                      autoCalcEndTime(formStartTime, "playlist", formPlaylistId);
                    }}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      formSourceType === "playlist"
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Playlist
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormSourceType("media");
                      // Single media files should default to loop_once to avoid repeating after schedule ends
                      setFormLoopOnce(true);
                      // Recalc end time from media file duration if one is selected
                      if (formMediaFileId) {
                        autoCalcEndTime(formStartTime, "media", undefined, formMediaFileId);
                      }
                    }}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      formSourceType === "media"
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Media File
                  </button>
                </div>
              </div>
            )}

            {/* Playlist selector */}
            {(formSourceType === "playlist" || editingBlock) && (
              <div className="mb-4">
                <label className="mb-1 block text-xs text-white/50">Playlist</label>
                <select
                  value={formPlaylistId}
                  onChange={(e) => {
                    const newId = Number(e.target.value);
                    setFormPlaylistId(newId);
                    autoCalcEndTime(formStartTime, "playlist", newId);
                  }}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                >
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id} className="bg-black">
                      {p.name}
                      {p.num_songs ? ` (${p.num_songs} song${p.num_songs !== 1 ? "s" : ""})` : ""}
                      {p.total_length ? ` — ${formatDuration(p.total_length)}` : ""}
                    </option>
                  ))}
                </select>
                {formSourceType === "playlist" && formPlaylistId > 0 && (() => {
                  const pl = playlists.find((p) => p.id === formPlaylistId);
                  return pl?.total_length ? (
                    <p className="mt-1 text-[10px] text-white/30">
                      Duration: {formatDuration(pl.total_length)}
                      {pl.num_songs ? ` · ${pl.num_songs} song${pl.num_songs !== 1 ? "s" : ""}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-white/25">
                      Duration unknown — end time won&apos;t auto-calculate
                    </p>
                  );
                })()}
              </div>
            )}

            {/* Media file selector */}
            {formSourceType === "media" && !editingBlock && (
              <div className="mb-4">
                <label className="mb-1 block text-xs text-white/50">Media File</label>
                <input
                  type="text"
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  placeholder="Search by title or artist..."
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/40 mb-2"
                />
                <div className="max-h-40 overflow-y-auto rounded border border-white/10 bg-white/5">
                  {mediaFiles
                    .filter((f) => {
                      if (!mediaSearch) return true;
                      const q = mediaSearch.toLowerCase();
                      return (
                        f.title?.toLowerCase().includes(q) ||
                        f.artist?.toLowerCase().includes(q) ||
                        f.path?.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 50)
                    .map((f) => (
                      <button
                        key={f.unique_id}
                        type="button"
                        onClick={() => {
                          setFormMediaFileId(f.unique_id);
                          autoCalcEndTime(formStartTime, "media", undefined, f.unique_id);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors border-b border-white/5 last:border-0 ${
                          formMediaFileId === f.unique_id
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate font-medium">{f.title || f.path}</div>
                          {f.length > 0 && (
                            <span className="shrink-0 text-[10px] text-white/25">{formatDuration(Math.round(f.length))}</span>
                          )}
                        </div>
                        {f.artist && (
                          <div className="truncate text-xs text-white/30">{f.artist}</div>
                        )}
                      </button>
                    ))}
                  {mediaFiles.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-white/30">
                      No media files found
                    </div>
                  )}
                </div>
                {formMediaFileId && (() => {
                  const file = mediaFiles.find((f) => f.unique_id === formMediaFileId);
                  return file ? (
                    <p className="mt-1 text-[10px] text-white/30">
                      Selected: {file.title || file.path}
                      {file.length > 0 ? ` — ${formatDuration(Math.round(file.length))}` : ""}
                    </p>
                  ) : null;
                })()}
                <p className="mt-1 text-[10px] text-white/25">
                  A playlist will be auto-created for this file
                </p>
              </div>
            )}

            {/* Time inputs */}
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-white/50">Start Time</label>
                <input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setFormStartTime(newStart);
                    // Recalculate end time based on content duration
                    autoCalcEndTime(newStart, formSourceType, formPlaylistId, formMediaFileId);
                  }}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-2 text-xs text-white/50">
                  End Time
                  {getSelectedDuration() > 0 && (
                    <button
                      type="button"
                      onClick={() => autoCalcEndTime(formStartTime, formSourceType, formPlaylistId, formMediaFileId)}
                      className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/20 hover:text-white/60 transition-colors"
                      title="Auto-calculate from content duration"
                    >
                      Auto
                    </button>
                  )}
                </label>
                <input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                />
              </div>
            </div>
            {/* Duration summary */}
            {(() => {
              const startMins = timeToMinutes(formStartTime);
              const endMins = timeToMinutes(formEndTime);
              const blockDuration = endMins > startMins ? endMins - startMins : (1440 - startMins) + endMins;
              const contentDuration = getSelectedDuration();
              return (
                <div className="mb-4 -mt-2 text-[10px] text-white/25">
                  Block: {blockDuration}m
                  {contentDuration > 0 && (
                    <>
                      {" · "}Content: {formatDuration(Math.round(contentDuration))}
                      {blockDuration > Math.ceil(contentDuration / 60) + 1 && (
                        <span className="text-yellow-400/50 ml-1">
                          ⚠ Block is {blockDuration - Math.ceil(contentDuration / 60)}m longer than content
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Date picker */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">Date</label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => {
                  const dateVal = e.target.value;
                  setFormStartDate(dateVal);
                  setFormEndDate(dateVal);
                  // Auto-set the day-of-week from the picked date
                  if (dateVal) {
                    const picked = new Date(dateVal + "T12:00:00");
                    setFormDays([picked.getDay()]);
                  }
                }}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
              />
              {formStartDate && (
                <p className="mt-1.5 text-[11px] text-white/30">
                  {DAY_LABELS[formDays[0] ?? 0]}
                </p>
              )}
            </div>

            {/* Frequency dropdown */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">Frequency</label>
              <select
                value={formRecurring ? "repeat" : "once"}
                onChange={(e) => {
                  const isRepeat = e.target.value === "repeat";
                  setFormRecurring(isRepeat);
                  if (isRepeat) {
                    setFormEndDate("");
                  } else {
                    setFormEndDate(formStartDate);
                  }
                }}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark] appearance-none"
              >
                <option value="once">One-time event</option>
                <option value="repeat">Repeat weekly</option>
              </select>
            </div>

            {/* End date — only visible when recurring */}
            {formRecurring && (
              <div className="mb-4">
                <label className="mb-2 block text-xs text-white/50">
                  Repeat until <span className="text-white/25">(optional)</span>
                </label>
                <input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                />
              </div>
            )}

            {/* Advanced options */}
            <div className="mb-6 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formInterrupt}
                  onChange={(e) => setFormInterrupt(e.target.checked)}
                  className="rounded border-white/20"
                />
                <span className="text-sm text-white/70">Interrupt current song at scheduled time</span>
              </label>
              <p className="text-[10px] text-white/25 ml-6 -mt-1">
                Without this, the scheduled playlist waits for the current song to finish
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formLoopOnce}
                  onChange={(e) => setFormLoopOnce(e.target.checked)}
                  className="rounded border-white/20"
                />
                <span className="text-sm text-white/70">Play once per schedule window</span>
                <span className="text-[10px] text-white/25">(don&apos;t loop)</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div>
                {editingBlock && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded border border-white/20 px-4 py-2 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || formDays.length === 0 || (formSourceType === "media" && !formMediaFileId && !editingBlock)}
                  className="rounded bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      Saving...
                    </span>
                  ) : editingBlock ? (
                    "Save Changes"
                  ) : (
                    "Add Block"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
