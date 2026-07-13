// Client-side fetch helpers shared by the management components — replaces
// ~40 hand-rolled fetch(POST, JSON.stringify) blocks. Throws Error(message)
// on non-OK responses; pass an AbortSignal from the effect cleanup so late
// responses from an unmounted tab can't set stale state.

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  opts?: { signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error || "Request failed");
  }
  return data as T;
}

export function radioPost<T = unknown>(
  body: Record<string, unknown>,
  opts?: { signal?: AbortSignal }
): Promise<T> {
  return postJson<T>("/api/radio", body, opts);
}

export async function radioGet<T = unknown>(
  endpoint: string,
  opts?: { signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(`/api/radio?endpoint=${encodeURIComponent(endpoint)}`, {
    cache: "no-store",
    signal: opts?.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error || "Request failed");
  }
  return data as T;
}
