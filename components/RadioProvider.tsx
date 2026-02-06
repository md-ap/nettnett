"use client";

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";

interface RadioState {
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  genre: string;
  nextTitle: string;
  isOnline: boolean;
  isLive: boolean;
  listeners: number;
  loading: boolean;
  albumArt: string | null;
  togglePlay: () => void;
}

const RadioContext = createContext<RadioState>({
  playing: false,
  title: "",
  artist: "",
  album: "",
  genre: "",
  nextTitle: "",
  isOnline: false,
  isLive: false,
  listeners: 0,
  loading: true,
  albumArt: null,
  togglePlay: () => {},
});

export function useRadio() {
  return useContext(RadioContext);
}

export default function RadioProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState("");
  const [nextTitle, setNextTitle] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [listeners, setListeners] = useState(0);
  const [loading, setLoading] = useState(true);
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const streamUrl = `${AZURACAST_URL}/listen/nettnett/radio.mp3`;

  // Create audio element once and keep it alive
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "none";
    }

    const audio = audioRef.current;

    const handleEnded = () => setPlaying(false);
    const handleError = () => setPlaying(false);

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    if (!AZURACAST_URL) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${AZURACAST_URL}/api/nowplaying/nettnett`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const idTagTitle = data.now_playing?.song?.title || "";
      const idTagArtist = data.now_playing?.song?.artist || "";
      const songPath = data.now_playing?.song?.path || "";

      // Default to ID3 tag values
      let resolvedTitle = idTagTitle || "Unknown Track";
      let resolvedArtist = idTagArtist;
      let resolvedArt: string | null = null;

      // Try to fetch NileDB/B2 metadata for richer info
      const metaUrl = songPath
        ? `/api/radio/metadata?path=${encodeURIComponent(songPath)}`
        : idTagTitle
          ? `/api/radio/metadata?song=${encodeURIComponent(idTagTitle)}`
          : null;

      if (metaUrl) {
        try {
          const metaRes = await fetch(metaUrl, { cache: "no-store" });
          const meta = await metaRes.json();
          if (meta.title) resolvedTitle = meta.title;
          if (meta.creator) resolvedArtist = meta.creator;
          if (meta.artUrl) resolvedArt = meta.artUrl;
        } catch {
          // Metadata fetch failed, keep ID3 tag values
        }
      }

      setTitle(resolvedTitle);
      setArtist(resolvedArtist);
      setAlbum(data.now_playing?.song?.album || "");
      setGenre(data.now_playing?.song?.genre || "");
      setNextTitle(data.playing_next?.song?.title || "");
      setAlbumArt(resolvedArt);
      setIsLive(data.live?.is_live || false);
      setListeners(data.listeners?.current || 0);

      const online =
        data.station?.is_online === true ||
        (data.now_playing?.song?.title && data.now_playing.song.title !== "");
      setIsOnline(!!online);
    } catch {
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (playing) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setPlaying(false);
    } else {
      audioRef.current.src = streamUrl;
      audioRef.current.load();
      audioRef.current.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  }, [playing, streamUrl]);

  return (
    <RadioContext.Provider
      value={{ playing, title, artist, album, genre, nextTitle, isOnline, isLive, listeners, loading, albumArt, togglePlay }}
    >
      {children}
    </RadioContext.Provider>
  );
}
