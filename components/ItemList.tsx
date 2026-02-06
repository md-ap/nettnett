"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  createdAt: string;
}

const B2_PUBLIC_URL = "https://f004.backblazeb2.com/file/nettnett1";

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

export default function ItemList({ items }: { items: UploadItem[] }) {
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
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
            <div className="flex items-center gap-3">
              <h3 className="font-medium">{item.title}</h3>
              {item.iaUrl ? (
                <a
                  href={item.iaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Internet Archive
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-white/40">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />
                  Cloud only
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">
                {formatDate(item.createdAt)}
              </span>
              <button
                onClick={() => handleDelete(item)}
                disabled={deletingFolder === item.folder}
                className="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
              >
                {deletingFolder === item.folder ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          {/* Files */}
          <ul className="divide-y divide-white/5">
            {item.files.map((file) => (
              <li
                key={file.key}
                className="flex items-center justify-between px-5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{file.name}</p>
                  <p className="text-xs text-white/40">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <a
                  href={`${B2_PUBLIC_URL}/${file.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Ver
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
