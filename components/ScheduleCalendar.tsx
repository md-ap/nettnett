"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */
interface ScheduleItem {
  id?: number;
  start_time: string;
  end_time: string;
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
  schedule_items?: ScheduleItem[];
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

export default function ScheduleCalendar() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

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

      setPlaylists(data);
      if (Array.isArray(filesData)) setMediaFiles(filesData);

      // For each scheduled playlist, fetch full details to get schedule_items
      const scheduledPlaylists = data.filter((p: Playlist) => p.type === "scheduled");
      const detailPromises = scheduledPlaylists.map(async (p: Playlist) => {
        const detailRes = await fetch(`/api/radio?endpoint=playlist/${p.id}`, { cache: "no-store" });
        return detailRes.json();
      });

      const details = await Promise.all(detailPromises);
      const allBlocks: ScheduleBlock[] = [];

      for (const detail of details) {
        if (detail.schedule_items && Array.isArray(detail.schedule_items)) {
          detail.schedule_items.forEach((item: ScheduleItem, index: number) => {
            allBlocks.push({
              playlistId: detail.id,
              playlistName: detail.name,
              itemIndex: index,
              startTime: item.start_time,
              endTime: item.end_time,
              days: item.days || [],
              startDate: item.start_date || undefined,
              endDate: item.end_date || undefined,
              loopOnce: item.loop_once || false,
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

  /* ─── Get fallback playlist (highest weight default enabled playlist) ─── */
  const fallbackPlaylist = playlists
    .filter((p) => p.type === "default" && p.is_enabled)
    .sort((a, b) => b.weight - a.weight)[0];

  /* ─── Modal helpers ─── */
  function openAddModal() {
    setEditingBlock(null);
    setFormSourceType("playlist");
    setFormPlaylistId(playlists[0]?.id || 0);
    setFormMediaFileId("");
    setMediaSearch("");
    setFormStartTime("00:00");
    setFormEndTime("01:00");
    setFormDays([selectedDay]);
    setFormStartDate("");
    setFormEndDate("");
    setFormLoopOnce(false);
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
    setFormStartDate(block.startDate || "");
    setFormEndDate(block.endDate || "");
    setFormLoopOnce(block.loopOnce || false);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBlock(null);
    setFormSourceType("playlist");
    setMediaSearch("");
    setFormStartDate("");
    setFormEndDate("");
    setFormLoopOnce(false);
    setError("");
  }

  function toggleDay(day: number) {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  /* ─── Save schedule block ─── */
  async function handleSave() {
    if (formDays.length === 0) {
      setError("Select at least one day");
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

        // Create the playlist
        const createRes = await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create-playlist", name: playlistName }),
        });
        const created = await createRes.json();
        targetPlaylistId = created.id;

        // Enable the playlist
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "playlist-toggle", playlistId: targetPlaylistId }),
        });

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

      // Build the new schedule item with optional date range
      const newItem: ScheduleItem = {
        start_time: formStartTime,
        end_time: formEndTime,
        days: formDays,
      };
      if (formStartDate) newItem.start_date = formStartDate;
      if (formEndDate) newItem.end_date = formEndDate;
      if (formLoopOnce) newItem.loop_once = true;

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

      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule-playlist",
          playlistId: targetPlaylistId,
          scheduleItems: newItems,
        }),
      });

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
      // No more schedule items — revert to default type
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unschedule-playlist",
          playlistId,
        }),
      });
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

  /* ─── Get blocks for a specific day ─── */
  function blocksForDay(day: number): ScheduleBlock[] {
    return blocks
      .filter((b) => b.days.includes(day))
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
      {/* Header */}
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

      {/* Desktop: Weekly grid */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/10">
            <div />
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                className={`py-2 text-center text-xs font-medium ${
                  i === new Date().getDay() ? "text-white" : "text-white/40"
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="relative grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Hour labels */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="col-start-1 border-b border-white/5 py-2 pr-2 text-right text-[10px] text-white/25"
                style={{ gridRow: h + 1 }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}

            {/* Day columns with hour grid lines */}
            {Array.from({ length: 7 }, (_, dayIdx) => (
              <div key={dayIdx} className="relative" style={{ gridColumn: dayIdx + 2, gridRow: "1 / -1" }}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-b border-white/5"
                    style={{ height: "32px" }}
                  />
                ))}

                {/* Schedule blocks */}
                {blocksForDay(dayIdx).map((block, blockIdx) => {
                  const startMins = timeToMinutes(block.startTime);
                  const endMins = timeToMinutes(block.endTime);
                  const duration = endMins > startMins ? endMins - startMins : (1440 - startMins) + endMins;
                  const top = (startMins / 60) * 32;
                  const height = Math.max((duration / 60) * 32, 16);
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
                      {height > 24 && (
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
            ))}
          </div>
        </div>
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
                    onClick={() => setFormSourceType("playlist")}
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
                    onClick={() => setFormSourceType("media")}
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
                  onChange={(e) => setFormPlaylistId(Number(e.target.value))}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                >
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id} className="bg-black">
                      {p.name} {p.type === "scheduled" ? "(scheduled)" : ""}
                    </option>
                  ))}
                </select>
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
                        onClick={() => setFormMediaFileId(f.unique_id)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors border-b border-white/5 last:border-0 ${
                          formMediaFileId === f.unique_id
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/5"
                        }`}
                      >
                        <div className="truncate font-medium">{f.title || f.path}</div>
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
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">End Time</label>
                <input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Day checkboxes */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">Days</label>
              <div className="flex gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`flex-1 rounded py-2 text-center text-xs font-medium transition-colors ${
                      formDays.includes(i)
                        ? "bg-white/20 text-white border border-white/30"
                        : "bg-white/5 text-white/30 border border-white/10 hover:text-white/50"
                    }`}
                  >
                    {label.charAt(0)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range (optional) */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-white/50">
                Date Range <span className="text-white/25">(optional — leave empty to repeat every week)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] text-white/30">From</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-white/30">To</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            {/* Loop once */}
            <div className="mb-6">
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
