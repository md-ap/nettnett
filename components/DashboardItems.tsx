"use client";

import { useState, useEffect, useCallback } from "react";
import ItemList from "./ItemList";

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
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchItems = useCallback(async (isRetry = false) => {
    if (isRetry) setRetrying(true);
    try {
      const res = await fetch("/api/files/list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Auto-retry every 30s when there's an error
  useEffect(() => {
    if (!error) return;
    const interval = setInterval(() => fetchItems(true), RETRY_INTERVAL);
    return () => clearInterval(interval);
  }, [error, fetchItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
        <span className="ml-3 text-sm text-neutral-400">Loading files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
        <p className="text-yellow-400 font-medium">
          Cloud storage temporarily unavailable
        </p>
        <p className="text-sm text-neutral-400 mt-2">
          {retrying
            ? "Retrying..."
            : "Auto-retrying every 30 seconds. You can still upload files."}
        </p>
        <button
          onClick={() => fetchItems(true)}
          className="mt-3 text-sm text-yellow-400 underline hover:text-yellow-300"
        >
          Retry now
        </button>
      </div>
    );
  }

  return <ItemList items={items} />;
}
