"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */
interface Streamer {
  id: number;
  streamer_username: string;
  display_name: string;
  is_active: boolean;
  enforce_schedule: boolean;
  comments: string;
  reactivate_at: number | null;
}

interface LiveInfo {
  isLive: boolean;
  streamerName: string;
}

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";

export default function StreamerManager() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [liveInfo, setLiveInfo] = useState<LiveInfo>({ isLive: false, streamerName: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingStreamer, setEditingStreamer] = useState<Streamer | null>(null);
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formEnforceSchedule, setFormEnforceSchedule] = useState(false);
  const [formComments, setFormComments] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  /* ─── Fetch streamers ─── */
  const fetchStreamers = useCallback(async () => {
    try {
      const res = await fetch("/api/radio?endpoint=streamers", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) {
        setStreamers(data);
      }
    } catch {
      setError("Failed to load streamers");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ─── Fetch live status ─── */
  const fetchLiveStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AZURACAST_URL}/api/nowplaying/nettnett`, { cache: "no-store" });
      const data = await res.json();
      setLiveInfo({
        isLive: data.live?.is_live || false,
        streamerName: data.live?.streamer_name || "",
      });
    } catch {
      // Keep previous state
    }
  }, []);

  useEffect(() => {
    fetchStreamers();
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStreamers, fetchLiveStatus]);

  /* ─── Form helpers ─── */
  function openCreateForm() {
    setEditingStreamer(null);
    setFormDisplayName("");
    setFormUsername("");
    setFormPassword("");
    setFormActive(true);
    setFormEnforceSchedule(false);
    setFormComments("");
    setShowForm(true);
  }

  function openEditForm(streamer: Streamer) {
    setEditingStreamer(streamer);
    setFormDisplayName(streamer.display_name);
    setFormUsername(streamer.streamer_username);
    setFormPassword("");
    setFormActive(streamer.is_active);
    setFormEnforceSchedule(streamer.enforce_schedule);
    setFormComments(streamer.comments || "");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingStreamer(null);
    setError("");
  }

  /* ─── Save streamer ─── */
  async function handleSave() {
    if (!formDisplayName.trim() || !formUsername.trim()) {
      setError("Display name and username are required");
      return;
    }
    if (!editingStreamer && !formPassword) {
      setError("Password is required for new streamers");
      return;
    }

    setFormSaving(true);
    setError("");

    try {
      if (editingStreamer) {
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-streamer",
            streamerId: editingStreamer.id,
            displayName: formDisplayName.trim(),
            username: formUsername.trim(),
            password: formPassword || undefined,
            isActive: formActive,
            enforceSchedule: formEnforceSchedule,
            comments: formComments.trim(),
          }),
        });
      } else {
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create-streamer",
            displayName: formDisplayName.trim(),
            username: formUsername.trim(),
            password: formPassword,
            isActive: formActive,
            enforceSchedule: formEnforceSchedule,
            comments: formComments.trim(),
          }),
        });
      }

      closeForm();
      await fetchStreamers();
    } catch {
      setError("Failed to save streamer");
    } finally {
      setFormSaving(false);
    }
  }

  /* ─── Delete streamer ─── */
  async function handleDelete(id: number) {
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-streamer", streamerId: id }),
      });
      setConfirmDelete(null);
      await fetchStreamers();
    } catch {
      setError("Failed to delete streamer");
    }
  }

  /* ─── Disconnect live streamer ─── */
  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect-streamer" }),
      });
      setTimeout(fetchLiveStatus, 3000);
    } catch {
      setError("Failed to disconnect streamer");
    } finally {
      setDisconnecting(false);
    }
  }

  /* ─── Toggle active ─── */
  async function toggleActive(streamer: Streamer) {
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-streamer",
          streamerId: streamer.id,
          isActive: !streamer.is_active,
        }),
      });
      await fetchStreamers();
    } catch {
      setError("Failed to update streamer");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live banner */}
      {liveInfo.isLive && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <div>
              <p className="text-sm font-medium text-red-300">LIVE</p>
              <p className="text-xs text-red-400/70">{liveInfo.streamerName || "DJ is broadcasting"}</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-white/50">
          DJs / Streamers
        </h2>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 rounded border border-white/20 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add DJ
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Streamers list */}
      {streamers.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/5 px-4 py-8 text-center">
          <p className="text-sm text-white/40">No DJ accounts yet</p>
          <p className="mt-1 text-xs text-white/25">Create a DJ account to enable live broadcasting</p>
        </div>
      ) : (
        <div className="space-y-2">
          {streamers.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{s.display_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.is_active
                        ? "bg-green-500/15 text-green-400"
                        : "bg-white/5 text-white/30"
                    }`}
                  >
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                  {s.enforce_schedule && (
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-400">
                      Scheduled
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/40">@{s.streamer_username}</p>
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle active */}
                <button
                  onClick={() => toggleActive(s)}
                  className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
                  title={s.is_active ? "Deactivate" : "Activate"}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    {s.is_active ? (
                      <path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10" />
                    ) : (
                      <path d="M5 12h14" />
                    )}
                  </svg>
                </button>

                {/* Edit */}
                <button
                  onClick={() => openEditForm(s)}
                  className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
                  title="Edit"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>

                {/* Delete */}
                {confirmDelete === s.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(s.id)}
                    className="rounded p-1.5 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BUTT Connection Info */}
      <div className="rounded border border-white/10 bg-white/5 p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/50">
          BUTT Connection Info
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-white/40">Protocol</span>
            <span className="font-mono text-white/70">Icecast</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/40">Server</span>
            <span className="font-mono text-white/70 text-xs truncate max-w-[200px]">
              {AZURACAST_URL ? AZURACAST_URL.replace(/^https?:\/\//, "") : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/40">Port</span>
            <span className="font-mono text-white/70">8000</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/40">Mount</span>
            <span className="font-mono text-white/70">/radio</span>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-[11px] text-white/30">
            Use the DJ username and password from the account above in BUTT or other broadcasting software.
          </p>
          <p className="text-[11px] text-white/30">
            When a DJ goes live, the auto-DJ will smoothly cross-fade to the live stream. When the DJ disconnects, the auto-DJ resumes automatically.
          </p>
        </div>
      </div>

      {/* ─── Create/Edit Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              {editingStreamer ? "Edit DJ" : "Add DJ"}
            </h3>

            {error && (
              <div className="mb-4 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-white/50">Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="DJ Name"
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-white/50">Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value.replace(/\s/g, ""))}
                  placeholder="djname"
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-white/50">
                  Password {editingStreamer && "(leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingStreamer ? "••••••••" : "Password"}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/40"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-white/70">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEnforceSchedule}
                    onChange={(e) => setFormEnforceSchedule(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-white/70">Enforce Schedule</span>
                </label>
              </div>

              <div>
                <label className="mb-1 block text-xs text-white/50">Comments</label>
                <textarea
                  value={formComments}
                  onChange={(e) => setFormComments(e.target.value)}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/40 resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeForm}
                disabled={formSaving}
                className="rounded border border-white/20 px-4 py-2 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={formSaving}
                className="rounded bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                {formSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Saving...
                  </span>
                ) : editingStreamer ? (
                  "Save Changes"
                ) : (
                  "Create DJ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
