"use client";

import { useRadio } from "./RadioProvider";

export default function NavMiniPlayer() {
  const { playing, title, artist, nextTitle, isOnline, loading, togglePlay } = useRadio();

  if (loading) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/30">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500/50" />
        Offline
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 transition-colors hover:bg-white/10"
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
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="truncate text-xs font-medium text-white max-w-[180px]">
          {title}
        </span>
        {artist && (
          <span className="truncate text-[10px] text-white/40 max-w-[180px]">
            {artist}
          </span>
        )}
      </div>

      {/* Next song */}
      {nextTitle && (
        <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-white/30">
          <span>Next:</span>
          <span className="truncate max-w-[120px]">{nextTitle}</span>
        </div>
      )}

      {/* Visualizer when playing */}
      {playing && (
        <div className="flex items-end gap-[2px] h-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-[2px] bg-white/50 rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 8 + 4}px`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: `${0.4 + Math.random() * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
