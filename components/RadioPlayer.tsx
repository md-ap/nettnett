"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  genre: string;
  isLive: boolean;
  isOnline: boolean;
  listeners: number;
}

interface RadioPlayerProps {
  onAlbumArtChange?: (artUrl: string | null) => void;
}

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";

export default function RadioPlayer({ onAlbumArtChange }: RadioPlayerProps = {}) {
  const [playing, setPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>({
    title: "",
    artist: "",
    album: "",
    genre: "",
    isLive: false,
    isOnline: false,
    listeners: 0,
  });
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const streamUrl = `${AZURACAST_URL}/listen/nettnett/radio.mp3`;

  const fetchNowPlaying = useCallback(async () => {
    if (!AZURACAST_URL) return;
    try {
      const res = await fetch(`${AZURACAST_URL}/api/nowplaying/nettnett`, {
        cache: "no-store",
      });
      const data = await res.json();

      const idTagTitle = data.now_playing?.song?.title || "";
      const idTagArtist = data.now_playing?.song?.artist || "";
      const songPath = data.now_playing?.song?.path || "";

      // Only use B2 album art from our metadata — ignore AzuraCast default icons
      let artUrl: string | null = null;

      // Prefer NileDB metadata for title/creator, fall back to ID3 tags
      let title = idTagTitle || "Unknown Track";
      let artist = idTagArtist;

      // Fetch NileDB/B2 metadata: use path if available, otherwise search by song title
      const metaUrl = songPath
        ? `/api/radio/metadata?path=${encodeURIComponent(songPath)}`
        : idTagTitle
          ? `/api/radio/metadata?song=${encodeURIComponent(idTagTitle)}`
          : null;

      if (metaUrl) {
        try {
          const metaRes = await fetch(metaUrl, { cache: "no-store" });
          const meta = await metaRes.json();
          if (meta.title) {
            title = meta.title;
          }
          if (meta.creator) {
            artist = meta.creator;
          }
          if (meta.artUrl) {
            artUrl = meta.artUrl;
          }
        } catch {
          // Metadata fetch failed, keep ID3 tag values
        }
      }

      onAlbumArtChange?.(artUrl);

      setNowPlaying({
        title,
        artist,
        album: data.now_playing?.song?.album || "",
        genre: data.now_playing?.song?.genre || "",
        isLive: data.live?.is_live || false,
        isOnline: data.station?.is_online ?? true,
        listeners: data.listeners?.current || 0,
      });
    } catch {
      setNowPlaying((prev) => ({ ...prev, isOnline: false }));
    } finally {
      setLoading(false);
    }
  }, [onAlbumArtChange]);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  function togglePlay() {
    if (!audioRef.current) return;

    if (playing) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setPlaying(false);
    } else {
      audioRef.current.src = streamUrl;
      audioRef.current.load();
      audioRef.current.play().catch(() => {
        setPlaying(false);
      });
      setPlaying(true);
    }
  }

  if (!AZURACAST_URL) return null;

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Now Playing Info */}
      <div className="text-center">
        {loading ? (
          <p className="text-sm text-white/40">Connecting...</p>
        ) : !nowPlaying.isOnline ? (
          <p className="text-sm text-white/40">Station Offline</p>
        ) : (
          <>
            {nowPlaying.isLive && (
              <span className="mb-2 inline-block rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
                ● LIVE
              </span>
            )}
            <p className="text-lg font-medium text-white">
              {nowPlaying.title}
            </p>
            {nowPlaying.artist && (
              <p className="mt-1 text-sm text-white/50">{nowPlaying.artist}</p>
            )}
            {nowPlaying.album && (
              <p className="mt-0.5 text-xs text-white/30">{nowPlaying.album}</p>
            )}
            {nowPlaying.genre && (
              <p className="mt-0.5 text-[10px] text-white/20">{nowPlaying.genre}</p>
            )}
          </>
        )}
      </div>

      {/* Play Button */}
      <button
        onClick={togglePlay}
        disabled={!nowPlaying.isOnline && !playing}
        className="group flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 transition-all hover:border-white/50 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {playing ? (
          <svg
            className="h-10 w-10 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg
            className="ml-1 h-10 w-10 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Visualizer bars (animated when playing) */}
      {playing && (
        <div className="flex items-end gap-1 h-8">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-white/60 rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 24 + 8}px`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: `${0.4 + Math.random() * 0.4}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Listeners count */}
      {nowPlaying.isOnline && nowPlaying.listeners > 0 && (
        <p className="text-xs text-white/30">
          {nowPlaying.listeners} listener{nowPlaying.listeners !== 1 ? "s" : ""}
        </p>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}
