// SSRF guard for server-side fetches of user-provided URLs.
// Blocks the obvious private/internal targets: loopback, RFC1918,
// link-local / cloud metadata, CGNAT, multicast/reserved, and internal
// hostnames. DNS rebinding is out of scope (fetch can't resolve-and-pin);
// callers are already role-gated — this is defense in depth.
//
// Note: the WHATWG URL parser canonicalizes hosts before we see them
// (decimal/hex IPv4 forms become dotted quads, IPv6 gets compressed),
// so matching on the canonical forms below is sufficient.

function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true; // unspecified, loopback
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA fc00::/7
  if (
    h.startsWith("fe8") ||
    h.startsWith("fe9") ||
    h.startsWith("fea") ||
    h.startsWith("feb")
  ) {
    return true; // link-local fe80::/10
  }
  // IPv4-mapped: WHATWG serializes ::ffff:10.0.0.1 as hex groups
  // (::ffff:a00:1), but accept the dotted form too.
  const v4Dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Dotted) {
    const parts = parseIpv4(v4Dotted[1]);
    return !parts || isPrivateIpv4(parts);
  }
  const v4Hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4Hex) {
    const hi = parseInt(v4Hex[1], 16);
    const lo = parseInt(v4Hex[2], 16);
    return isPrivateIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  return false;
}

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  // WHATWG keeps brackets on IPv6 hostnames
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) return false;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    return false;
  }

  const v4 = parseIpv4(host);
  if (v4) return !isPrivateIpv4(v4);
  if (host.includes(":")) return !isPrivateIpv6(host);

  return true;
}
