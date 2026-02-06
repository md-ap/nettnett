"use client";

import { useState, useEffect, useCallback } from "react";

interface SongInfo {
  title: string;
  artist: string;
  art: string | null;
}

interface NowPlayingData {
  current: SongInfo;
  next: SongInfo | null;
  isLive: boolean;
  isOnline: boolean;
  listeners: number;
  elapsed: number;
  duration: number;
}

async function enrichSong(
  idTagTitle: string,
  idTagArtist: string,
  songPath: string
): Promise<SongInfo> {
  let title = idTagTitle || "Unknown Track";
  let artist = idTagArtist;
  let art: string | null = null;

  // Fetch NileDB/B2 metadata
  const metaUrl = songPath
    ? `/api/radio/metadata?path=${encodeURIComponent(songPath)}`
    : idTagTitle
      ? `/api/radio/metadata?song=${encodeURIComponent(idTagTitle)}`
      : null;

  if (metaUrl) {
    try {
      const res = await fetch(metaUrl, { cache: "no-store" });
      const meta = await res.json();
      if (meta.title) title = meta.title;
      if (meta.creator) artist = meta.creator;
      if (meta.artUrl) art = meta.artUrl;
    } catch {
      // Keep ID3 tag values
    }
  }

  return { title, artist, art };
}

export default function NowPlayingControl() {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const fetchNowPlaying = useCallback(async () => {
    try {
      const [npRes, statusRes] = await Promise.all([
        fetch("/api/radio?endpoint=nowplaying", { cache: "no-store" }),
        fetch("/api/radio?endpoint=status", { cache: "no-store" }),
      ]);
      const json = await npRes.json();
      const status = await statusRes.json();

      const isOnline = status.backendRunning === true && status.frontendRunning === true;

      const np = json.now_playing || {};
      const song = np.song || {};
      const nextData = json.playing_next?.song || null;

      // Enrich current and next songs with NileDB metadata in parallel
      const [current, next] = await Promise.all([
        enrichSong(song.title || "", song.artist || "", song.path || ""),
        nextData
          ? enrichSong(nextData.title || "", nextData.artist || "", nextData.path || "")
          : Promise.resolve(null),
      ]);

      setData({
        current,
        next,
        isLive: json.live?.is_live || false,
        isOnline,
        listeners: json.listeners?.current || 0,
        elapsed: np.elapsed || 0,
        duration: np.duration || 0,
      });
    } catch {
      setData((prev) =>
        prev ? { ...prev, isOnline: false } : null
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setTimeout(fetchNowPlaying, 2000);
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionLoading("");
    }
  }

  const progressPercent =
    data && data.duration > 0 ? (data.elapsed / data.duration) * 100 : 0;

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function SongCard({ song, label }: { song: SongInfo; label: string }) {
    return (
      <div className="flex-1 min-w-0">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/35">
          {label}
        </p>
        <div className="flex items-center gap-3">
          {song.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.art}
              alt=""
              className="h-12 w-12 flex-shrink-0 rounded bg-white/10 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-white/10">
              <svg
                className="h-6 w-6 text-white/20"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {song.title}
            </p>
            {song.artist && (
              <p className="truncate text-xs text-white/50">{song.artist}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
      {/* Header with status badge */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-white/50">
          Stream
        </h2>
        {!loading && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              data?.isOnline
                ? "bg-green-500/15 text-green-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                data?.isOnline
                  ? "bg-green-400 animate-pulse"
                  : "bg-red-400"
              }`}
            />
            {data?.isOnline ? "STREAMING" : "OFFLINE"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      ) : (
        <>
          {/* Offline message */}
          {!data?.isOnline && (
            <div className="mb-4 rounded border border-red-500/10 bg-red-500/5 px-4 py-6 text-center">
              <p className="text-sm text-white/50">
                Stream is currently stopped
              </p>
              <p className="mt-1 text-xs text-white/25">
                Press Start Stream to begin broadcasting
              </p>
            </div>
          )}

          {/* Now Playing + Playing Next */}
          {data?.isOnline && (
            <>
              <div className="mb-4 flex gap-6">
                <SongCard song={data.current} label="Now Playing" />
                {data.next && (
                  <SongCard song={data.next} label="Playing Next" />
                )}
              </div>

              {/* Progress bar */}
              {data.duration > 0 && (
                <div className="mb-4">
                  <div className="mb-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-white/50 transition-all duration-1000"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>{formatTime(data.elapsed)}</span>
                    <span>{formatTime(data.duration)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {data?.isOnline ? (
              <button
                onClick={() => handleAction("stop")}
                disabled={actionLoading === "stop"}
                className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-5 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-30"
                title="Stop Stream"
              >
                {actionLoading === "stop" ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
                ) : (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                )}
                Stop Stream
              </button>
            ) : (
              <button
                onClick={() => handleAction("start")}
                disabled={actionLoading === "start"}
                className="flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-5 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-30"
                title="Start Stream"
              >
                {actionLoading === "start" ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-400/30 border-t-green-400" />
                ) : (
                  <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                )}
                Start Stream
              </button>
            )}

            {/* Skip */}
            {data?.isOnline && (
              <button
                onClick={() => handleAction("skip")}
                disabled={actionLoading === "skip"}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 transition-colors hover:bg-white/10 disabled:opacity-30"
                title="Skip Song"
              >
                {actionLoading === "skip" ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                ) : (
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <polygon points="5,3 15,12 5,21" />
                    <rect x="16" y="3" width="3" height="18" />
                  </svg>
                )}
              </button>
            )}

            {/* Restart */}
            <button
              onClick={() => handleAction("restart")}
              disabled={actionLoading === "restart"}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 transition-colors hover:bg-white/10 disabled:opacity-30"
              title="Restart Station"
            >
              {actionLoading === "restart" ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              ) : (
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                </svg>
              )}
            </button>
          </div>

          {/* Listeners */}
          {data?.isOnline && (
            <div className="mt-4 text-center text-xs text-white/30">
              {data.listeners} listener{data.listeners !== 1 ? "s" : ""}
            </div>
          )}
        </>
      )}
    </div>
  );
}
