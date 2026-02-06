"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface B2File {
  key: string;
  name: string;
  size: number;
  lastModified: string | Date;
}

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

const B2_PUBLIC_URL = "https://f004.backblazeb2.com/file/nettnett1";

export default function FileList({ initialFiles }: { initialFiles: B2File[] }) {
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete(fileKey: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    setDeletingKey(fileKey);
    try {
      const res = await fetch("/api/files/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete file");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingKey(null);
    }
  }

  if (initialFiles.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 p-8 text-center">
        <p className="text-white/50">No files uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold">
          Your Files ({initialFiles.length})
        </h2>
      </div>
      <ul className="divide-y divide-white/10">
        {initialFiles.map((file) => (
          <li
            key={file.key}
            className="flex items-center justify-between px-6 py-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {file.name}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {formatFileSize(file.size)} &middot;{" "}
                {formatDate(file.lastModified)}
              </p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <a
                href={`${B2_PUBLIC_URL}/${file.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded px-3 py-1 text-sm text-white transition-colors hover:bg-white/10"
              >
                Ver
              </a>
              <button
                onClick={() => handleDelete(file.key)}
                disabled={deletingKey === file.key}
                className="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
              >
                {deletingKey === file.key ? "Deleting..." : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
