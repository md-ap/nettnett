"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useRadio } from "./RadioProvider";

// Floating stream player, mounted once in the root layout so its state and
// the audio survive navigation. Hidden where it makes no sense: the home
// page IS the big player, and the minimal auth pages have no chrome.
const HIDDEN_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

// bottom uses the iOS safe-area inset so the pill clears the home indicator
const POSITION =
  "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40";

export default function FloatingPlayer() {
  const pathname = usePathname();
  const { playing, title, artist, isOnline, loading, togglePlay } = useRadio();
  const [minimized, setMinimized] = useState(false);

  if (HIDDEN_PATHS.has(pathname) || loading) return null;

  if (!isOnline) {
    return (
      <div
        className={`${POSITION} flex items-center gap-2 rounded-full border border-white/10 bg-black/90 px-3 py-2 text-xs text-white/30 shadow-xl backdrop-blur-md`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500/50" />
        Offline
      </div>
    );
  }

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title={title}
        aria-label="Expand player"
        className={`${POSITION} flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/90 shadow-xl backdrop-blur-md transition-colors hover:bg-white/10`}
      >
        {playing ? (
          <span className="flex h-3 items-end gap-[2px]">
            {[...Array(3)].map((_, i) => (
              <span
                key={i}
                className="w-[2px] animate-pulse rounded-full bg-white/70"
                style={{ height: `${4 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        ) : (
          <svg className="ml-0.5 h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div
      className={`${POSITION} flex items-center gap-3 rounded-full border border-white/15 bg-black/90 py-2 pl-2 pr-3 shadow-xl backdrop-blur-md`}
    >
      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 transition-colors hover:bg-white/10"
      >
        {playing ? (
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Song info */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="max-w-[140px] truncate text-xs font-medium text-white sm:max-w-[200px]">
          {title}
        </span>
        {artist && (
          <span className="max-w-[140px] truncate text-[10px] text-white/40 sm:max-w-[200px]">
            {artist}
          </span>
        )}
      </div>

      {/* Visualizer when playing */}
      {playing && (
        <div className="flex h-3 items-end gap-[2px]">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-[2px] animate-pulse rounded-full bg-white/50"
              style={{
                height: `${Math.random() * 8 + 4}px`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: `${0.4 + Math.random() * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Minimize */}
      <button
        onClick={() => setMinimized(true)}
        aria-label="Minimize player"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
