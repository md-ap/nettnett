"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Spinner from "@/components/ui/Spinner";
import { formatDate } from "@/lib/format";

interface ActivityEntry {
  id: string;
  userName: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { value: "", label: "All activity" },
  { value: "file", label: "Files" },
  { value: "broadcast", label: "URL Broadcast" },
  { value: "playlist", label: "Playlists" },
  { value: "calendar", label: "Calendar" },
  { value: "dj", label: "DJ accounts" },
  { value: "stream", label: "Live stream" },
  { value: "recordings", label: "Recordings" },
  { value: "station", label: "Station" },
  { value: "management", label: "Panel" },
  { value: "admin", label: "Admin" },
  { value: "auth", label: "Accounts" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter((c) => c.value).map((c) => [c.value, c.label])
);

const BADGE_STYLES: Record<string, string> = {
  file: "bg-blue-500/20 text-blue-300",
  broadcast: "bg-purple-500/20 text-purple-300",
  playlist: "bg-green-500/20 text-green-300",
  calendar: "bg-cyan-500/20 text-cyan-300",
  dj: "bg-orange-500/20 text-orange-300",
  stream: "bg-red-500/20 text-red-300",
  recordings: "bg-pink-500/20 text-pink-300",
  station: "bg-yellow-500/20 text-yellow-300",
  management: "bg-white/10 text-white/60",
  admin: "bg-yellow-500/20 text-yellow-300",
  auth: "bg-white/10 text-white/60",
};

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(
    async (opts: { page: number; q: string; category: string }, signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(opts.page));
        if (opts.q) params.set("q", opts.q);
        if (opts.category) params.set("category", opts.category);
        const res = await fetch(`/api/activity?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load activity");
        setEntries(data.entries);
        setTotal(data.total);
        setPageSize(data.pageSize || 50);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load activity");
      }
      if (!signal?.aborted) setLoading(false);
    },
    []
  );

  // Debounced fetch on search; immediate on page/category change
  useEffect(() => {
    const controller = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchLogs({ page, q, category }, controller.signal),
      q ? 350 : 0
    );
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [page, q, category, fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by user, action or detail..."
          className="min-w-52 flex-1 rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 [&>option]:bg-neutral-900"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => fetchLogs({ page, q, category })}
          className="rounded border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-white/40">
            No activity yet — actions like uploads, broadcasts, playlist and
            calendar changes will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/5 rounded border border-white/10 bg-white/[0.02]">
          {entries.map((entry) => {
            const prefix = entry.action.split(".")[0];
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                    BADGE_STYLES[prefix] || "bg-white/10 text-white/60"
                  }`}
                  title={entry.action}
                >
                  {CATEGORY_LABELS[prefix] || prefix}
                </span>
                <span className="text-sm font-medium text-white">
                  {entry.userName}
                </span>
                <span className="min-w-0 flex-1 text-sm text-white/60">
                  {entry.detail || entry.action}
                </span>
                <span className="shrink-0 text-xs text-white/30">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Previous
          </button>
          <span className="text-sm text-white/40">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-white/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Next
          </button>
        </div>
      )}

      {!loading && (
        <p className="text-xs text-white/30">
          {total} entr{total === 1 ? "y" : "ies"} · logs are kept for 180 days
        </p>
      )}
    </div>
  );
}
