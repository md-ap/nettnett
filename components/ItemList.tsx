"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import RichTextEditor from "./RichTextEditor";

interface UploadItemFile {
  key: string;
  name: string;
  size: number;
  lastModified: string | Date;
}

interface UploadItem {
  title: string;
  folder: string;
  iaIdentifier: string | null;
  iaUrl: string | null;
  files: UploadItemFile[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

const B2_PUBLIC_URL = "https://f004.backblazeb2.com/file/nettnett1";

const MEDIA_TYPES = [
  { value: "texts", label: "Texts (Books, Documents, PDFs)" },
  { value: "movies", label: "Movies (Video files)" },
  { value: "audio", label: "Audio (Music, Podcasts)" },
  { value: "image", label: "Images (Photos, Art)" },
  { value: "software", label: "Software" },
  { value: "data", label: "Data (Generic)" },
];

const LANGUAGES = [
  { value: "", label: "Select language" },
  { value: "eng", label: "English" },
  { value: "spa", label: "Spanish" },
  { value: "ara", label: "Arabic" },
  { value: "zho", label: "Chinese" },
  { value: "nld", label: "Dutch" },
  { value: "fra", label: "French" },
  { value: "deu", label: "German" },
  { value: "hin", label: "Hindi" },
  { value: "ita", label: "Italian" },
  { value: "jpn", label: "Japanese" },
  { value: "kor", label: "Korean" },
  { value: "pol", label: "Polish" },
  { value: "por", label: "Portuguese" },
  { value: "rus", label: "Russian" },
  { value: "swe", label: "Swedish" },
  { value: "tur", label: "Turkish" },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateString: string | Date): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Edit Modal ── */
function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: UploadItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = item.metadata || {};
  const [title, setTitle] = useState((meta.title as string) || item.title);
  const [description, setDescription] = useState(
    (meta.description as string) || ""
  );
  const [mediatype, setMediatype] = useState(
    (meta.mediatype as string) || "data"
  );
  const [creator, setCreator] = useState((meta.creator as string) || "");
  const [date, setDate] = useState((meta.date as string) || "");
  const [subject, setSubject] = useState(
    Array.isArray(meta.subject)
      ? (meta.subject as string[]).join(", ")
      : (meta.subject as string) || ""
  );
  const [language, setLanguage] = useState((meta.language as string) || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/files/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: item.folder,
          title: title.trim(),
          description: description.trim(),
          mediatype,
          creator: creator.trim() || null,
          date: date || null,
          subject: subject.trim() || null,
          language: language || null,
        }),
      });

      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-white/10 bg-[#0a0a0a] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Upload</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* IA Warning */}
        {item.iaUrl && (
          <div className="mb-4 rounded border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <p className="text-sm text-yellow-400">
              Published to Internet Archive — metadata changes won&apos;t sync to IA
            </p>
            <p className="mt-1 text-xs text-yellow-400/60">
              To update on Internet Archive, delete this item and re-upload
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm text-white/60">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={saving}
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/50 disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm text-white/60">
              Description *
            </label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Describe the content..."
              disabled={saving}
            />
          </div>

          {/* Media Type & Creator */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-white/60">
                Media Type
              </label>
              <select
                value={mediatype}
                onChange={(e) => setMediatype(e.target.value)}
                disabled={saving}
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-white/50 disabled:opacity-50"
              >
                {MEDIA_TYPES.map((mt) => (
                  <option key={mt.value} value={mt.value} className="bg-black">
                    {mt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-white/60">
                Creator
              </label>
              <input
                type="text"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                disabled={saving}
                placeholder="Author or creator"
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/50 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Date & Language */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-white/60">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={saving}
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-white/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-white/60">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={saving}
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-white/50 disabled:opacity-50"
              >
                {LANGUAGES.map((lang) => (
                  <option
                    key={lang.value}
                    value={lang.value}
                    className="bg-black"
                  >
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm text-white/60">Tags</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={saving}
              placeholder="Comma-separated tags"
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/50 disabled:opacity-50"
            />
          </div>

          {/* Files (read-only) */}
          <div>
            <label className="mb-1 block text-sm text-white/60">
              Files (read-only)
            </label>
            <div className="rounded border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {item.files.map((file) => (
                <div
                  key={file.key}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <span className="truncate text-sm text-white/50">
                    {file.name}
                  </span>
                  <span className="text-xs text-white/30">
                    {formatFileSize(file.size)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* IA status (read-only) */}
          {item.iaUrl && (
            <div className="flex items-center gap-3 rounded border border-white/10 bg-white/[0.02] px-4 py-3">
              <input
                type="checkbox"
                checked={true}
                disabled
                className="h-4 w-4 shrink-0 rounded border-white/30 accent-white opacity-50"
              />
              <span className="text-sm text-white/40">
                Published to{" "}
                <a
                  href={item.iaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 underline"
                >
                  Internet Archive
                </a>
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded border border-white/20 px-5 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !description.trim()}
              className="rounded bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Item List ── */
export default function ItemList({ items }: { items: UploadItem[] }) {
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<UploadItem | null>(null);
  const router = useRouter();

  async function handleDelete(item: UploadItem) {
    const msg = item.iaIdentifier
      ? "This will delete from Cloud AND Internet Archive. Are you sure?"
      : "Are you sure you want to delete this item?";

    if (!confirm(msg)) return;

    setDeletingFolder(item.folder);
    try {
      const res = await fetch("/api/files/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleFolder: item.folder,
          iaIdentifier: item.iaIdentifier,
          fileNames: item.files.map((f) => f.name),
        }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete item");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingFolder(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 p-8 text-center">
        <p className="text-white/50">No uploads yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Your Uploads ({items.length})</h2>

      {items.map((item) => (
        <div
          key={item.folder}
          className="rounded-lg border border-white/10 overflow-hidden"
        >
          {/* Item Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="font-medium truncate">{item.title}</h3>
              {item.iaUrl ? (
                <a
                  href={item.iaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Internet Archive
                </a>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />
                  Cloud only
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-white/40">
                {formatDate(item.createdAt)}
              </span>
              <button
                onClick={() => setEditingItem(item)}
                className="rounded px-3 py-1 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(item)}
                disabled={deletingFolder === item.folder}
                className="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
              >
                {deletingFolder === item.folder ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          {/* Item metadata row */}
          {((item.metadata?.creator as string) || (item.metadata?.mediatype as string)) && (
            <div className="flex items-center gap-4 border-b border-white/5 px-5 py-2 text-xs text-white/40">
              {(item.metadata?.creator as string) && (
                <span>
                  <span className="text-white/25">Creator:</span>{" "}
                  {item.metadata.creator as string}
                </span>
              )}
              {(item.metadata?.mediatype as string) && (
                <span>
                  <span className="text-white/25">Type:</span>{" "}
                  {MEDIA_TYPES.find(
                    (mt) => mt.value === (item.metadata.mediatype as string)
                  )?.label || (item.metadata.mediatype as string)}
                </span>
              )}
            </div>
          )}

          {/* Column headers */}
          <div className="flex items-center px-5 py-1.5 text-[10px] uppercase tracking-wider text-white/25 border-b border-white/5">
            <span className="flex-1">File</span>
            <span className="w-20 text-right">Size</span>
            <span className="w-16" />
          </div>

          {/* Files */}
          <ul className="divide-y divide-white/5">
            {item.files.map((file) => (
              <li
                key={file.key}
                className="flex items-center px-5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{file.name}</p>
                </div>
                <span className="w-20 text-right text-xs text-white/40">
                  {formatFileSize(file.size)}
                </span>
                <span className="w-16 text-right">
                  <a
                    href={`${B2_PUBLIC_URL}/${file.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Ver
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Edit Modal Overlay */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
