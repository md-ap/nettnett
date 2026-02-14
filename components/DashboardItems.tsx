"use client";

import { useState, useEffect, useCallback } from "react";
import ItemList from "./ItemList";
import UploadForm from "./UploadForm";

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

const RETRY_INTERVAL = 30_000; // 30 seconds

export default function DashboardItems() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [b2Down, setB2Down] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchItems = useCallback(async (isRetry = false) => {
    if (isRetry) setRetrying(true);
    try {
      const res = await fetch("/api/files/list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setB2Down(false);
    } catch {
      setB2Down(true);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Auto-retry every 30s when B2 is down
  useEffect(() => {
    if (!b2Down) return;
    const interval = setInterval(() => fetchItems(true), RETRY_INTERVAL);
    return () => clearInterval(interval);
  }, [b2Down, fetchItems]);

  // Refresh callback for child components
  const refreshItems = useCallback(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div className="space-y-8">
      {/* Upload form — disabled when B2 is down */}
      <UploadForm disabled={b2Down} onRefresh={refreshItems} />

      {/* B2 status banner */}
      {b2Down && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <p className="text-yellow-400 font-medium">
            Cloud storage temporarily unavailable
          </p>
          <p className="text-sm text-neutral-400 mt-2">
            {retrying
              ? "Retrying connection..."
              : "Uploads and file listing are paused. Auto-retrying every 30 seconds."}
          </p>
          <button
            onClick={() => fetchItems(true)}
            className="mt-3 text-sm text-yellow-400 underline hover:text-yellow-300"
          >
            Retry now
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
          <span className="ml-3 text-sm text-neutral-400">Loading files...</span>
        </div>
      )}

      {/* Items list */}
      {!loading && !b2Down && <ItemList items={items} onRefresh={refreshItems} />}
    </div>
  );
}
