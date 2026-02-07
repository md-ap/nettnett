"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface MediaFile {
  id: number;
  unique_id: string;
  song_id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  length: number;
  length_text: string;
  path: string;
  art: string;
  mtime: number;
  playlists: Array<{ id: number; name: string }>;
}

interface ScheduleItem {
  start_time: number;
  end_time: number;
  days: number[];
  start_date?: string;
  end_date?: string;
  loop_once?: boolean;
}

interface Playlist {
  id: number;
  name: string;
  is_enabled: boolean;
  num_songs: number;
  total_length: number;
  type: string;
  weight: number;
  order: string;
  schedule_items?: ScheduleItem[];
  backend_options?: string[];
}

export default function PlaylistManager() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [expandedPlaylist, setExpandedPlaylist] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draggedFile, setDraggedFile] = useState<MediaFile | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  // Drag reorder state for playlists
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<number | null>(null);
  const [dragOverPlaylistId, setDragOverPlaylistId] = useState<number | null>(null);
  // Drag reorder state for songs within a playlist
  const [draggedSong, setDraggedSong] = useState<{ file: MediaFile; playlistId: number } | null>(null);
  const [dragOverSongIndex, setDragOverSongIndex] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const dropdownBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const dragCounterRef = useRef(0);
  const mediaScrollRef = useRef<HTMLDivElement>(null);

  // Fetch playlists and ensure all are sequential (not shuffle)
  const fetchPlaylists = useCallback(async () => {
    try {
      const res = await fetch("/api/radio?endpoint=playlists");
      const data = await res.json();
      if (Array.isArray(data)) {
        // Auto-fix: set any shuffle playlists to sequential
        for (const pl of data) {
          if (pl.order && pl.order !== "sequential") {
            try {
              await fetch("/api/radio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "playlist-update",
                  playlistId: pl.id,
                  order: "sequential",
                }),
              });
              pl.order = "sequential";
            } catch {
              // Non-critical, continue
            }
          }
        }
        // Fetch details for each playlist to get schedule_items
        const detailPromises = data.map(async (pl: Playlist) => {
          try {
            const detailRes = await fetch(`/api/radio?endpoint=playlist/${pl.id}`, { cache: "no-store" });
            const detail = await detailRes.json();
            pl.schedule_items = detail.schedule_items || [];
            pl.backend_options = detail.backend_options || [];
          } catch {
            pl.schedule_items = [];
            pl.backend_options = [];
          }
          return pl;
        });
        await Promise.all(detailPromises);

        // Sort by weight (higher weight = higher priority = first)
        const sorted = [...data].sort((a: Playlist, b: Playlist) => (b.weight || 0) - (a.weight || 0));
        setPlaylists(sorted);
      }
    } catch (err) {
      console.error("Failed to fetch playlists:", err);
    }
  }, []);

  // Fetch media files
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/radio?endpoint=files");
      const data = await res.json();
      if (Array.isArray(data)) {
        setMediaFiles(data);
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
    }
  }, []);

  // Derive playlist songs from media files
  const getPlaylistSongs = useCallback(
    (playlistId: number): MediaFile[] => {
      return mediaFiles.filter((f) =>
        f.playlists?.some((p) => p.id === playlistId)
      );
    },
    [mediaFiles]
  );

  // Initial load
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchPlaylists(), fetchFiles()]);
      setLoading(false);
    }
    loadAll();
  }, [fetchPlaylists, fetchFiles]);

  // Open dropdown with position calculation
  function openDropdown(fileId: number) {
    if (openDropdownId === fileId) {
      setOpenDropdownId(null);
      setDropdownPos(null);
      return;
    }
    const btn = dropdownBtnRefs.current.get(fileId);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = playlists.length * 32 + 40; // estimate
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      setDropdownPos({
        top: openUp ? rect.top - dropdownHeight : rect.bottom + 4,
        left: rect.right - 180, // align right edge
        openUp,
      });
    }
    setOpenDropdownId(fileId);
  }

  // Close dropdown on scroll or click outside
  useEffect(() => {
    if (openDropdownId === null) return;
    const scrollEl = mediaScrollRef.current;
    const handleScroll = () => { setOpenDropdownId(null); setDropdownPos(null); };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown]")) {
        setOpenDropdownId(null);
        setDropdownPos(null);
      }
    };
    scrollEl?.addEventListener("scroll", handleScroll);
    document.addEventListener("mousedown", handleClick);
    return () => {
      scrollEl?.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [openDropdownId]);

  // Auto-refresh files when there are processing items (every 10s)
  useEffect(() => {
    const hasProcessing = mediaFiles.some((f) => f.length === 0 || !f.length_text);
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      fetchFiles();
      fetchPlaylists();
    }, 10000);
    return () => clearInterval(interval);
  }, [mediaFiles, fetchFiles, fetchPlaylists]);

  // Check if a file is still being processed
  function isProcessing(file: MediaFile): boolean {
    return file.length === 0 || !file.length_text;
  }

  // Add file to playlist
  async function addToPlaylist(file: MediaFile, playlistId: number) {
    setActionLoading(`add-${file.id}`);
    try {
      const res = await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-to-playlist",
          playlistId,
          mediaPath: file.path,
        }),
      });
      if (res.ok) {
        await Promise.all([fetchFiles(), fetchPlaylists()]);
      }
    } catch (err) {
      console.error("Failed to add to playlist:", err);
    } finally {
      setActionLoading("");
    }
  }

  // Toggle file in/out of a specific playlist
  async function toggleFileInPlaylist(file: MediaFile, playlistId: number) {
    const isIn = file.playlists?.some((p) => p.id === playlistId);
    setActionLoading(`toggle-file-${file.id}-${playlistId}`);
    try {
      if (isIn) {
        // Remove from this specific playlist using remove-from-playlist (clears all),
        // then re-add to remaining playlists
        const remaining = file.playlists.filter((p) => p.id !== playlistId);

        // First remove from all playlists
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "remove-from-playlist",
            mediaPath: file.path,
          }),
        });

        // Then re-add to remaining playlists one by one
        for (const p of remaining) {
          await fetch("/api/radio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add-to-playlist",
              playlistId: p.id,
              mediaPath: file.path,
            }),
          });
        }
      } else {
        // Add to this playlist
        await fetch("/api/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add-to-playlist",
            playlistId,
            mediaPath: file.path,
          }),
        });
      }
      await Promise.all([fetchFiles(), fetchPlaylists()]);
    } catch (err) {
      console.error("Failed to toggle file in playlist:", err);
    } finally {
      setActionLoading("");
    }
  }

  // Remove file from playlist
  async function removeFromPlaylist(file: MediaFile) {
    setActionLoading(`remove-${file.id}`);
    try {
      const res = await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove-from-playlist",
          mediaPath: file.path,
        }),
      });
      if (res.ok) {
        await Promise.all([fetchFiles(), fetchPlaylists()]);
      }
    } catch (err) {
      console.error("Failed to remove from playlist:", err);
    } finally {
      setActionLoading("");
    }
  }

  // Toggle playlist enabled/disabled
  async function togglePlaylist(playlistId: number) {
    setActionLoading(`toggle-${playlistId}`);
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playlist-toggle",
          playlistId,
        }),
      });
      await fetchPlaylists();
    } catch (err) {
      console.error("Failed to toggle playlist:", err);
    } finally {
      setActionLoading("");
    }
  }

  // Create new playlist
  async function createPlaylist() {
    if (!newPlaylistName.trim()) return;
    setActionLoading("create-playlist");
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-playlist",
          name: newPlaylistName.trim(),
        }),
      });
      setNewPlaylistName("");
      setShowNewPlaylist(false);
      await fetchPlaylists();
    } catch (err) {
      console.error("Failed to create playlist:", err);
    } finally {
      setActionLoading("");
    }
  }

  // Delete playlist
  async function deletePlaylist(playlistId: number) {
    setActionLoading(`delete-${playlistId}`);
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-playlist",
          playlistId,
        }),
      });
      setConfirmDelete(null);
      if (expandedPlaylist === playlistId) {
        setExpandedPlaylist(null);
      }
      await fetchPlaylists();
    } catch (err) {
      console.error("Failed to delete playlist:", err);
    } finally {
      setActionLoading("");
    }
  }

  // Reorder playlists by updating weights
  async function reorderPlaylists(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const reordered = [...playlists];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setPlaylists(reordered);

    // Assign weights: highest weight = first in list
    for (let i = 0; i < reordered.length; i++) {
      const weight = reordered.length - i;
      if (reordered[i].weight !== weight) {
        try {
          await fetch("/api/radio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "playlist-update",
              playlistId: reordered[i].id,
              weight,
            }),
          });
        } catch (err) {
          console.error("Failed to update playlist weight:", err);
        }
      }
    }
    await fetchPlaylists();
  }

  // Filter files for media library
  const filteredFiles = mediaFiles.filter((f) => {
    const query = searchQuery.toLowerCase();
    return (
      f.title?.toLowerCase().includes(query) ||
      f.artist?.toLowerCase().includes(query) ||
      f.path?.toLowerCase().includes(query)
    );
  });

  const processingFiles = filteredFiles.filter((f) => isProcessing(f));
  const readyFiles = filteredFiles.filter((f) => !isProcessing(f));
  const sortedFiles = [...processingFiles, ...readyFiles];

  // Check if file is in any playlist
  function isInAnyPlaylist(file: MediaFile): boolean {
    return file.playlists?.length > 0;
  }

  // Playlist drag handlers
  function handlePlaylistDragStart(e: React.DragEvent, playlistId: number) {
    e.dataTransfer.effectAllowed = "move";
    setDraggedPlaylistId(playlistId);
  }

  function handlePlaylistDragOver(e: React.DragEvent, playlistId: number) {
    e.preventDefault();
    if (draggedPlaylistId && draggedPlaylistId !== playlistId) {
      setDragOverPlaylistId(playlistId);
    }
  }

  function handlePlaylistDrop(e: React.DragEvent, targetPlaylistId: number) {
    e.preventDefault();
    if (!draggedPlaylistId || draggedPlaylistId === targetPlaylistId) return;
    const fromIndex = playlists.findIndex((p) => p.id === draggedPlaylistId);
    const toIndex = playlists.findIndex((p) => p.id === targetPlaylistId);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderPlaylists(fromIndex, toIndex);
    }
    setDraggedPlaylistId(null);
    setDragOverPlaylistId(null);
  }

  // Media file drag into playlist zone
  function handleMediaDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleMediaDrop(e: React.DragEvent, playlistId: number) {
    e.preventDefault();
    dragCounterRef.current = 0;
    if (draggedFile) {
      addToPlaylist(draggedFile, playlistId);
      setDraggedFile(null);
    }
  }

  // Reorder songs by arrow buttons (mobile)
  async function reorderSongByIndex(playlistId: number, fromIndex: number, toIndex: number) {
    const songs = getPlaylistSongs(playlistId);
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= songs.length) return;
    const reordered = [...songs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playlist-reorder",
          playlistId,
          order: reordered.map((s) => s.id),
        }),
      });
      await Promise.all([fetchFiles(), fetchPlaylists()]);
    } catch (err) {
      console.error("Failed to reorder songs:", err);
    }
  }

  // Song drag within playlist
  function handleSongDragStart(file: MediaFile, playlistId: number) {
    setDraggedSong({ file, playlistId });
  }

  function handleSongDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverSongIndex(index);
  }

  async function handleSongDrop(e: React.DragEvent, playlistId: number, toIndex: number) {
    e.preventDefault();
    if (!draggedSong || draggedSong.playlistId !== playlistId) {
      setDraggedSong(null);
      setDragOverSongIndex(null);
      return;
    }

    const songs = getPlaylistSongs(playlistId);
    const fromIndex = songs.findIndex((s) => s.id === draggedSong.file.id);
    if (fromIndex === -1 || fromIndex === toIndex) {
      setDraggedSong(null);
      setDragOverSongIndex(null);
      return;
    }

    // Optimistic reorder
    const reordered = [...songs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Send reorder to AzuraCast
    try {
      await fetch("/api/radio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playlist-reorder",
          playlistId,
          order: reordered.map((s) => s.id),
        }),
      });
      await Promise.all([fetchFiles(), fetchPlaylists()]);
    } catch (err) {
      console.error("Failed to reorder songs:", err);
    }

    setDraggedSong(null);
    setDragOverSongIndex(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== TOP: PLAYLISTS ===== */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-white/50">
            Playlists
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/25">
              Drag to reorder priority
            </span>
            <button
              onClick={() => setShowNewPlaylist(!showNewPlaylist)}
              className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              {showNewPlaylist ? "Cancel" : "+ New"}
            </button>
          </div>
        </div>

        {/* New playlist form */}
        {showNewPlaylist && (
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
              className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30"
              autoFocus
            />
            <button
              onClick={createPlaylist}
              disabled={!newPlaylistName.trim() || actionLoading === "create-playlist"}
              className="rounded bg-white/10 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/20 disabled:opacity-30"
            >
              {actionLoading === "create-playlist" ? "..." : "Create"}
            </button>
          </div>
        )}

        {playlists.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/30">No playlists found</p>
        ) : (
          <div className="space-y-2">
            {playlists.map((pl, plIndex) => {
              const songs = getPlaylistSongs(pl.id);
              const isExpanded = expandedPlaylist === pl.id;
              const isDragOver = dragOverPlaylistId === pl.id;

              return (
                <div
                  key={pl.id}
                  className={`rounded-lg border transition-colors ${
                    isDragOver
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                  onDragOver={(e) => {
                    handlePlaylistDragOver(e, pl.id);
                    // Also accept media file drops
                    if (draggedFile) handleMediaDragOver(e);
                  }}
                  onDrop={(e) => {
                    if (draggedPlaylistId) {
                      handlePlaylistDrop(e, pl.id);
                    } else if (draggedFile) {
                      handleMediaDrop(e, pl.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (draggedPlaylistId) setDragOverPlaylistId(null);
                  }}
                >
                  {/* Playlist header */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {/* Drag handle for playlist reorder (desktop) */}
                    <div
                      draggable
                      onDragStart={(e) => handlePlaylistDragStart(e, pl.id)}
                      onDragEnd={() => {
                        setDraggedPlaylistId(null);
                        setDragOverPlaylistId(null);
                      }}
                      className="hidden md:block cursor-grab active:cursor-grabbing p-0.5 text-white/20 hover:text-white/40"
                      title="Drag to reorder"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="9" cy="5" r="1.5" />
                        <circle cx="15" cy="5" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" />
                        <circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="19" r="1.5" />
                        <circle cx="15" cy="19" r="1.5" />
                      </svg>
                    </div>

                    {/* Reorder arrows (mobile) */}
                    <div className="flex flex-col gap-0.5 md:hidden">
                      <button
                        onClick={() => { if (plIndex > 0) reorderPlaylists(plIndex, plIndex - 1); }}
                        disabled={plIndex === 0}
                        className="p-0.5 text-white/30 disabled:opacity-20"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button
                        onClick={() => { if (plIndex < playlists.length - 1) reorderPlaylists(plIndex, plIndex + 1); }}
                        disabled={plIndex === playlists.length - 1}
                        className="p-0.5 text-white/30 disabled:opacity-20"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    {/* Priority number */}
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[10px] font-medium text-white/40">
                      {plIndex + 1}
                    </span>

                    {/* Playlist info */}
                    <button
                      onClick={() => setExpandedPlaylist(isExpanded ? null : pl.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {pl.name}
                        </span>
                        <span className="text-xs text-white/30">
                          {songs.length} {songs.length === 1 ? "song" : "songs"}
                        </span>
                        {pl.order === "sequential" && (
                          <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] text-blue-400">
                            SEQ
                          </span>
                        )}
                        {pl.schedule_items && pl.schedule_items.length > 0 && (
                          <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] text-purple-400">
                            SCHEDULED
                          </span>
                        )}
                      </div>
                      {/* Schedule details line */}
                      {pl.schedule_items && pl.schedule_items.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-purple-400/60">
                          {pl.schedule_items.map((si, idx) => {
                            const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                            const days = (si.days || []).map(d => dayNames[d] || "?").join(", ");
                            const st = `${String(Math.floor(si.start_time / 100)).padStart(2, "0")}:${String(si.start_time % 100).padStart(2, "0")}`;
                            const et = `${String(Math.floor(si.end_time / 100)).padStart(2, "0")}:${String(si.end_time % 100).padStart(2, "0")}`;
                            return (
                              <span key={idx}>
                                {idx > 0 && " | "}
                                {days} {st}-{et}
                              </span>
                            );
                          })}
                          {" — Only plays during scheduled time"}
                        </div>
                      )}
                    </button>

                    {/* Expand arrow */}
                    <button
                      onClick={() => setExpandedPlaylist(isExpanded ? null : pl.id)}
                      className="p-1 text-white/30 transition-transform hover:text-white/60"
                    >
                      <svg
                        className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlaylist(pl.id);
                        }}
                        disabled={actionLoading === `toggle-${pl.id}`}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          pl.is_enabled
                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            : "bg-white/10 text-white/40 hover:bg-white/20"
                        }`}
                        title={pl.is_enabled ? "Disable" : "Enable"}
                      >
                        {actionLoading === `toggle-${pl.id}`
                          ? "..."
                          : pl.is_enabled
                            ? "ON"
                            : "OFF"}
                      </button>

                      {/* Delete */}
                      {confirmDelete === pl.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deletePlaylist(pl.id)}
                            disabled={actionLoading === `delete-${pl.id}`}
                            className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/30"
                          >
                            {actionLoading === `delete-${pl.id}` ? "..." : "Yes"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/20"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(pl.id);
                          }}
                          className="rounded p-0.5 text-white/20 transition-colors hover:text-red-400"
                          title="Delete playlist"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded: songs in playlist */}
                  {isExpanded && (
                    <div className="border-t border-white/5 px-3 py-2">
                      {songs.length === 0 ? (
                        <p className="py-3 text-center text-xs text-white/20">
                          Empty playlist — drag files here to add
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">
                            <span className="hidden md:inline">Drag songs to reorder</span>
                            <span className="md:hidden">Tap arrows to reorder</span>
                          </p>
                          {songs.map((song, i) => (
                            <div
                              key={song.id}
                              draggable
                              onDragStart={() => handleSongDragStart(song, pl.id)}
                              onDragOver={(e) => handleSongDragOver(e, i)}
                              onDrop={(e) => handleSongDrop(e, pl.id, i)}
                              onDragEnd={() => {
                                setDraggedSong(null);
                                setDragOverSongIndex(null);
                              }}
                              className={`group flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors md:cursor-grab md:active:cursor-grabbing hover:bg-white/5 ${
                                draggedSong?.file.id === song.id ? "opacity-40" : ""
                              } ${
                                dragOverSongIndex === i && draggedSong?.playlistId === pl.id
                                  ? "border-t-2 border-white/30"
                                  : ""
                              }`}
                            >
                              {/* Song drag handle (desktop) */}
                              <svg className="hidden md:block h-3 w-3 flex-shrink-0 text-white/15" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="9" cy="5" r="1.5" />
                                <circle cx="15" cy="5" r="1.5" />
                                <circle cx="9" cy="12" r="1.5" />
                                <circle cx="15" cy="12" r="1.5" />
                                <circle cx="9" cy="19" r="1.5" />
                                <circle cx="15" cy="19" r="1.5" />
                              </svg>
                              {/* Song reorder arrows (mobile) */}
                              <div className="flex flex-col gap-0 md:hidden flex-shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); reorderSongByIndex(pl.id, i, i - 1); }}
                                  disabled={i === 0}
                                  className="p-0.5 text-white/30 disabled:opacity-20"
                                >
                                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" /></svg>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); reorderSongByIndex(pl.id, i, i + 1); }}
                                  disabled={i === songs.length - 1}
                                  className="p-0.5 text-white/30 disabled:opacity-20"
                                >
                                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </div>
                              <span className="w-4 text-right text-white/20">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-white/60">
                                  {song.title || song.path?.split("/").pop()}
                                </p>
                                {song.artist && (
                                  <p className="truncate text-white/25">{song.artist}</p>
                                )}
                              </div>
                              <span className="text-white/20">{song.length_text}</span>
                              {/* Remove from playlist */}
                              <button
                                onClick={() => removeFromPlaylist(song)}
                                disabled={actionLoading === `remove-${song.id}`}
                                className="hidden rounded p-0.5 text-white/20 transition-colors hover:text-red-400 group-hover:block disabled:opacity-30"
                                title="Remove from playlist"
                              >
                                {actionLoading === `remove-${song.id}` ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/80" />
                                ) : (
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== BOTTOM: MEDIA LIBRARY ===== */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-sm font-medium text-white">
            Media Library ({mediaFiles.length})
            {processingFiles.length > 0 && (
              <span className="ml-1 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
                {processingFiles.length} processing
              </span>
            )}
          </h2>
          <button
            onClick={() => {
              fetchFiles();
              fetchPlaylists();
            }}
            className="rounded border border-white/10 p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white"
            title="Refresh"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search media files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30"
          />
        </div>

        {/* Media file list */}
        <div ref={mediaScrollRef} className="max-h-[500px] overflow-y-auto">
          {filteredFiles.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/30">
              {mediaFiles.length === 0
                ? "No media files found. Upload files or sync from B2."
                : "No matching files"}
            </p>
          ) : (
            <div className="space-y-1">
              {sortedFiles.map((file) => {
                const processing = isProcessing(file);
                return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 rounded px-3 py-2 transition-colors ${
                      processing ? "opacity-50" : "hover:bg-white/5"
                    }`}
                  >
                    {/* Processing spinner */}
                    {processing && (
                      <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border border-yellow-400/30 border-t-yellow-400/80" />
                    )}

                    {/* File info */}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${processing ? "text-white/40" : "text-white/80"}`}>
                        {file.title || file.path?.split("/").pop() || "Unknown"}
                      </p>
                      <div className="flex items-center gap-2">
                        {processing ? (
                          <span className="text-xs text-yellow-400/60">Processing...</span>
                        ) : (
                          <>
                            {file.artist && (
                              <span className="truncate text-xs text-white/35">{file.artist}</span>
                            )}
                            {file.album && (
                              <span className="truncate text-xs text-white/20">{file.album}</span>
                            )}
                            <span className="text-xs text-white/20">{file.length_text}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Playlist badges */}
                    {!processing && file.playlists?.length > 0 && (
                      <div className="flex gap-1">
                        {file.playlists.map((p) => (
                          <span
                            key={p.id}
                            className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-400"
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Playlist dropdown button */}
                    {!processing && playlists.length > 0 && (
                      <div className="flex-shrink-0" data-dropdown>
                        <button
                          ref={(el) => { if (el) dropdownBtnRefs.current.set(file.id, el); }}
                          onClick={() => openDropdown(file.id)}
                          className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          {file.playlists?.length > 0 ? "Edit" : "+ Add"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fixed dropdown portal — rendered outside overflow containers */}
      {openDropdownId !== null && dropdownPos && (
        <div
          data-dropdown
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/15 bg-neutral-900 py-1 shadow-xl"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/30">
            Add to playlists
          </p>
          {playlists.map((pl) => {
            const file = mediaFiles.find((f) => f.id === openDropdownId);
            if (!file) return null;
            const isIn = file.playlists?.some((p) => p.id === pl.id);
            const isToggling = actionLoading === `toggle-file-${file.id}-${pl.id}`;
            return (
              <button
                key={pl.id}
                onClick={() => toggleFileInPlaylist(file, pl.id)}
                disabled={isToggling}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                    isIn
                      ? "border-green-400 bg-green-400/20"
                      : "border-white/20"
                  }`}
                >
                  {isIn && (
                    <svg className="h-2.5 w-2.5 text-green-400" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isToggling && (
                    <div className="h-2 w-2 animate-spin rounded-full border border-white/20 border-t-white/80" />
                  )}
                </span>
                <span className={isIn ? "text-white" : "text-white/60"}>
                  {pl.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
