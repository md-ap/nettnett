"use client";

import { useCallback, useEffect, useState } from "react";

interface RecordingItem {
  key: string;
  dj: string;
  filename: string;
  recordedAt: string | null;
  sizeBytes: number;
  estimatedDurationSec: number;
  playUrl: string;
  ia: { identifier: string; url: string; sentAt: string } | null;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function RecordingsManager() {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Send-to-IA modal state
  const [iaTarget, setIaTarget] = useState<RecordingItem | null>(null);
  const [iaTitle, setIaTitle] = useState("");
  const [iaDescription, setIaDescription] = useState("");

  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setRecordings(data);
    } catch {
      // best-effort
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const openIaModal = (rec: RecordingItem) => {
    const dateLabel = rec.recordedAt ? rec.recordedAt.slice(0, 10) : "";
    setIaTitle(`NettNett Live — ${rec.dj} — ${dateLabel}`);
    setIaDescription("");
    setIaTarget(rec);
    setMessage(null);
  };

  const sendToIa = async () => {
    if (!iaTarget) return;
    setBusyKey(iaTarget.key);
    setMessage(null);
    try {
      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-to-ia",
          key: iaTarget.key,
          title: iaTitle,
          description: iaDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send to Internet Archive");
      setMessage({
        type: "ok",
        text: "Sent to Internet Archive. It may take a few minutes to appear publicly.",
      });
      setIaTarget(null);
      fetchRecordings();
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to send to Internet Archive",
      });
    }
    setBusyKey(null);
  };

  const deleteRecording = async (rec: RecordingItem) => {
    if (
      !confirm(
        rec.ia
          ? `Delete recording "${rec.filename}"? (The Internet Archive copy stays online.)`
          : `Delete recording "${rec.filename}"? This cannot be undone.`
      )
    )
      return;
    setBusyKey(rec.key);
    setMessage(null);
    try {
      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", key: rec.key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to delete");
      setMessage({ type: "ok", text: "Recording deleted." });
      fetchRecordings();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to delete" });
    }
    setBusyKey(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">
          Live sessions are recorded automatically and stored in the cloud when the DJ
          disconnects.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            fetchRecordings();
          }}
          className="shrink-0 rounded border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
        >
          Refresh
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-white/40">Loading recordings...</p>
      ) : recordings.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-white/40">
            No recordings yet — go live from the Streamers tab and your session will appear
            here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recordings.map((rec) => (
            <div
              key={rec.key}
              className="rounded border border-white/10 bg-white/5 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {formatDate(rec.recordedAt)}
                    </p>
                    {rec.ia ? (
                      <a
                        href={rec.ia.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-medium text-green-400 hover:bg-green-500/25 transition-colors"
                      >
                        Internet Archive ↗
                      </a>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-medium text-white/40">
                        Cloud only
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-white/40">
                    DJ: <span className="text-white/60">{rec.dj}</span> · ~
                    {formatDuration(rec.estimatedDurationSec)} · {formatSize(rec.sizeBytes)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setPlayingKey(playingKey === rec.key ? null : rec.key)}
                    className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                  >
                    {playingKey === rec.key ? "Hide player" : "Play"}
                  </button>
                  <a
                    href={rec.playUrl}
                    download={rec.filename}
                    className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                  >
                    Download
                  </a>
                  {!rec.ia && (
                    <button
                      onClick={() => openIaModal(rec)}
                      disabled={busyKey === rec.key}
                      className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                    >
                      Send to Internet Archive
                    </button>
                  )}
                  <button
                    onClick={() => deleteRecording(rec)}
                    disabled={busyKey === rec.key}
                    className="rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {playingKey === rec.key && (
                <audio controls autoPlay src={rec.playUrl} className="w-full h-10">
                  Your browser does not support audio playback.
                </audio>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Send to IA modal */}
      {iaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Send to Internet Archive</h3>
            <p className="text-xs text-white/40">
              This publishes the recording publicly on archive.org. Larger files can take a
              minute or two to transfer.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80">Title</label>
              <input
                type="text"
                value={iaTitle}
                onChange={(e) => setIaTitle(e.target.value)}
                maxLength={120}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80">
                Description (optional)
              </label>
              <textarea
                value={iaDescription}
                onChange={(e) => setIaDescription(e.target.value)}
                rows={3}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIaTarget(null)}
                disabled={busyKey === iaTarget.key}
                className="rounded border border-white/20 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={sendToIa}
                disabled={busyKey === iaTarget.key || !iaTitle.trim()}
                className="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                {busyKey === iaTarget.key ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
