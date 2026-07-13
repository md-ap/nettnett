import { fetchWithRetry } from "./http-retry";

// Local-backup webhooks to the legacy NAS (decommission pending).
// Every trigger is a no-op when NAS_WEBHOOK_URL / NAS_WEBHOOK_SECRET
// are unset, and never throws — the NAS copy is best-effort.

function nasEndpoint(suffix: string): { url: string; secret: string } | null {
  const webhookUrl = process.env.NAS_WEBHOOK_URL;
  const secret = process.env.NAS_WEBHOOK_SECRET;
  if (!webhookUrl || !secret) return null;
  if (suffix === "/sync") return { url: webhookUrl, secret };
  // Replace only the trailing path, not the hostname (the hostname also
  // contains "sync": sync.radionettnettstream.com/sync)
  const url = webhookUrl.endsWith("/sync")
    ? webhookUrl.slice(0, -5) + suffix
    : webhookUrl + suffix;
  return { url, secret };
}

async function callNas(suffix: string, label: string, body?: unknown): Promise<void> {
  const endpoint = nasEndpoint(suffix);
  if (!endpoint) return;
  await fetchWithRetry(
    endpoint.url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${endpoint.secret}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    label
  );
}

export function triggerNasSync(): Promise<void> {
  return callNas("/sync", "NAS sync webhook");
}

export function triggerNasIaUpload(data: {
  userFolder: string;
  titleFolder: string;
  iaIdentifier: string;
}): Promise<void> {
  console.log("triggerNasIaUpload: payload", JSON.stringify(data));
  return callNas("/ia-upload", "NAS IA upload webhook", data);
}

export function triggerNasDelete(data: {
  userFolder: string;
  titleFolder: string;
}): Promise<void> {
  return callNas("/delete-item", "NAS delete webhook", data);
}
