"use client";

import { useCallback, useEffect, useState } from "react";

interface ScheduleItem {
  start_time: number;
  end_time: number;
  days: number[];
  start_date?: string | null;
  end_date?: string | null;
}

interface UrlBroadcastItem {
  id: number;
  name: string;
  title: string;
  is_instant: boolean;
  is_enabled: boolean;
  remote_url: string | null;
  schedule_items: ScheduleItem[];
}

const DURATION_OPTIONS = [
  { value: 0, label: "Auto-detect" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 360, label: "6 hours" },
];

function timeIntToStr(t: number): string {
  const h = Math.floor(t / 100);
  const m = t % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function UrlBroadcast() {
  // Instant broadcast form
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState(0);

  // Schedule form
  const [schedTitle, setSchedTitle] = useState("");
  const [schedUrl, setSchedUrl] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedDuration, setSchedDuration] = useState(0);

  // Data
  const [items, setItems] = useState<UrlBroadcastItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const instant = items.find((i) => i.is_instant);
  const instantActive = instant && instant.is_enabled ? instant : null;
  const scheduled = items.filter((i) => !i.is_instant);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/radio?endpoint=url-broadcasts", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {
      // best-effort refresh
    }
    try {
      const res = await fetch("/api/radio?endpoint=nowplaying", { cache: "no-store" });
      const data = await res.json();
      const song = data?.now_playing?.song;
      setNowPlaying(song ? [song.title, song.artist].filter(Boolean).join(" — ") : "");
    } catch {
      // ignore
    }
    setStatusLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const post = async (bodyObj: Record<string, unknown>, okText: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setMessage({ type: "ok", text: okText });
      setTimeout(fetchStatus, 3000);
      setLoading(false);
      return data;
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      setLoading(false);
      return null;
    }
  };

  const startBroadcast = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setMessage({ type: "error", text: "Enter a valid http(s) URL to an MP3 or stream." });
      return;
    }
    const data = await post(
      { action: "broadcast-url", url: trimmed, durationMinutes: duration },
      "Broadcast starting — the stream switches in ~30 seconds."
    );
    if (data) {
      setUrl("");
      if (data.detectedSource) {
        setMessage({
          type: "ok",
          text: `Broadcast starting (${data.durationMinutes} min, duration ${
            data.detectedSource === "internet-archive" ? "from Internet Archive" : "estimated"
          }) — the stream switches in ~30 seconds.`,
        });
      }
    }
  };

  const stopBroadcast = () =>
    post(
      { action: "stop-broadcast-url" },
      "Broadcast stopped — returning to normal rotation in ~30 seconds."
    );

  const scheduleBroadcast = async () => {
    if (!schedTitle.trim()) {
      setMessage({ type: "error", text: "Enter a title for the scheduled broadcast." });
      return;
    }
    if (!/^https?:\/\/.+/i.test(schedUrl.trim())) {
      setMessage({ type: "error", text: "Enter a valid http(s) URL to an MP3 or stream." });
      return;
    }
    if (!schedDate || !schedTime) {
      setMessage({ type: "error", text: "Pick a date and start time." });
      return;
    }
    const data = await post(
      {
        action: "schedule-url-broadcast",
        title: schedTitle.trim(),
        url: schedUrl.trim(),
        date: schedDate,
        startTime: schedTime,
        durationMinutes: schedDuration,
      },
      "Broadcast scheduled."
    );
    if (data) {
      setSchedTitle("");
      setSchedUrl("");
      setSchedDate("");
      setSchedTime("");
      setMessage({
        type: "ok",
        text: `Scheduled: ${data.name} (${data.durationMinutes} min${
          data.detectedSource === "internet-archive"
            ? ", exact duration from Internet Archive"
            : data.detectedSource === "mp3-estimate"
              ? ", estimated duration"
              : ""
        }). It also appears in the Calendar tab.`,
      });
    }
  };

  const deleteScheduled = async (item: UrlBroadcastItem) => {
    if (!confirm(`Delete scheduled broadcast "${item.title}"?`)) return;
    await post({ action: "delete-url-broadcast", playlistId: item.id }, "Broadcast deleted.");
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Status */}
      <div className="rounded border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-1">Status</p>
            {statusLoading ? (
              <p className="text-sm text-white/40">Loading...</p>
            ) : instantActive ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  URL broadcast active
                </p>
                {instantActive.title && (
                  <p className="mt-1 text-sm text-white/80">🎵 {instantActive.title}</p>
                )}
                {instantActive.remote_url && (
                  <p
                    className="mt-1 truncate text-xs text-white/50"
                    title={instantActive.remote_url}
                  >
                    {instantActive.remote_url}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-white/60">Normal rotation (playlists)</p>
            )}
            {!instantActive && nowPlaying && (
              <p className="mt-2 text-xs text-white/40">
                Now playing: <span className="text-white/70">{nowPlaying}</span>
              </p>
            )}
          </div>
          {instantActive && (
            <button
              onClick={stopBroadcast}
              disabled={loading}
              className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {loading ? "Stopping..." : "Stop broadcast"}
            </button>
          )}
        </div>
      </div>

      {/* Broadcast now */}
      <div className="rounded border border-white/10 bg-white/5 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-white">Broadcast now</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white/80">Audio URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://archive.org/download/item/audio.mp3"
            disabled={loading}
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40 disabled:opacity-50"
          />
          <p className="mt-1.5 text-xs text-white/40">
            Direct link to a public MP3 or stream (e.g. Internet Archive). It interrupts the
            rotation and takes over the air.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={loading}
              className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 disabled:opacity-50 [&>option]:bg-neutral-900"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={startBroadcast}
            disabled={loading || !url.trim()}
            className="rounded border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? "Working..." : "Broadcast"}
          </button>
        </div>
        <p className="text-xs text-white/40">
          Auto-detect reads the exact duration from Internet Archive (or estimates it from the
          MP3). When the audio ends, the station returns to normal rotation automatically.
        </p>
      </div>

      {/* Schedule for later */}
      <div className="rounded border border-white/10 bg-white/5 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-white">Schedule for later</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-white/80">Title</label>
            <input
              type="text"
              value={schedTitle}
              onChange={(e) => setSchedTitle(e.target.value)}
              placeholder="e.g. Tuesday Show"
              maxLength={80}
              disabled={loading}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40 disabled:opacity-50"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-white/80">Audio URL</label>
            <input
              type="url"
              value={schedUrl}
              onChange={(e) => setSchedUrl(e.target.value)}
              placeholder="https://archive.org/download/item/audio.mp3"
              disabled={loading}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Date</label>
            <input
              type="date"
              value={schedDate}
              onChange={(e) => setSchedDate(e.target.value)}
              disabled={loading}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 disabled:opacity-50 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Start time</label>
            <input
              type="time"
              value={schedTime}
              onChange={(e) => setSchedTime(e.target.value)}
              disabled={loading}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 disabled:opacity-50 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Duration</label>
            <select
              value={schedDuration}
              onChange={(e) => setSchedDuration(Number(e.target.value))}
              disabled={loading}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 disabled:opacity-50 [&>option]:bg-neutral-900"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={scheduleBroadcast}
              disabled={loading || !schedTitle.trim() || !schedUrl.trim() || !schedDate || !schedTime}
              className="w-full rounded border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {loading ? "Working..." : "Schedule"}
            </button>
          </div>
        </div>
        <p className="text-xs text-white/40">
          Times are in the station&apos;s timezone. Scheduled broadcasts also appear in the
          Calendar tab and run once on the chosen date.
        </p>
      </div>

      {/* Scheduled list */}
      {scheduled.length > 0 && (
        <div className="rounded border border-white/10 bg-white/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Scheduled URL broadcasts</h3>
          {scheduled.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/5 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{item.title}</p>
                {item.schedule_items[0] && (
                  <p className="text-xs text-white/50">
                    {item.schedule_items[0].start_date || "—"} ·{" "}
                    {timeIntToStr(item.schedule_items[0].start_time)}–
                    {timeIntToStr(item.schedule_items[0].end_time)}
                  </p>
                )}
                {item.remote_url && (
                  <p className="truncate text-xs text-white/30" title={item.remote_url}>
                    {item.remote_url}
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteScheduled(item)}
                disabled={loading}
                className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Feedback */}
      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
