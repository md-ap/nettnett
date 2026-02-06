"use client";

import { useRadio } from "./RadioProvider";

export default function RadioPlayer() {
  const { playing, title, artist, album, genre, isOnline, isLive, listeners, loading, togglePlay } = useRadio();

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Now Playing Info */}
      <div className="text-center">
        {loading ? (
          <p className="text-sm text-white/40">Connecting...</p>
        ) : !isOnline ? (
          <p className="text-sm text-white/40">Station Offline</p>
        ) : (
          <>
            {isLive && (
              <span className="mb-2 inline-block rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
                ● LIVE
              </span>
            )}
            <p className="text-lg font-medium text-white">
              {title}
            </p>
            {artist && (
              <p className="mt-1 text-sm text-white/50">{artist}</p>
            )}
            {album && (
              <p className="mt-0.5 text-xs text-white/30">{album}</p>
            )}
            {genre && (
              <p className="mt-0.5 text-[10px] text-white/20">{genre}</p>
            )}
          </>
        )}
      </div>

      {/* Play Button */}
      <button
        onClick={togglePlay}
        disabled={!isOnline && !playing}
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
      {isOnline && listeners > 0 && (
        <p className="text-xs text-white/30">
          {listeners} listener{listeners !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
