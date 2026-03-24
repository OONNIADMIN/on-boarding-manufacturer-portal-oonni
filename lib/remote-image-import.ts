/** Max size when downloading a remote image before uploading to ImageKit */
export const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;

const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);

function isBlockedIp(hostname: string): boolean {
  if (hostname === "localhost") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = hostname.match(ipv4);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Validates URL for server-side fetch (basic SSRF hardening).
 */
export function assertHttpUrlForFetch(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty URL");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isBlockedIp(host)) {
    throw new Error("URL host is not allowed");
  }
  return url;
}

function cellLooksLikeStartOfUrl(t: string): boolean {
  const x = t.trim();
  if (!x) return false;
  if (/^https?:\/\//i.test(x) || x.startsWith("//")) return true;
  // host.tld/... (Excel often omits scheme)
  return /^[\w][\w.-]*\.[a-z]{2,}([/:?&#]|$)/i.test(x);
}

/**
 * Split a spreadsheet cell that may contain several image URLs separated by `;`.
 * Re-merges pieces that are not a new URL (e.g. `;` inside a query string).
 * Adds https:// when a segment looks like a host path without scheme.
 */
export function splitUrlsInCell(cell: unknown): string[] {
  const s = String(cell ?? "").trim();
  if (!s) return [];

  const withScheme = (t: string): string | null => {
    const x = t.trim();
    if (!x) return null;
    if (/^https?:\/\//i.test(x)) return x;
    if (x.startsWith("//")) return `https:${x}`;
    if (/^[\w][\w.-]*\.[a-z]{2,}([/:?&#]|$)/i.test(x)) return `https://${x.replace(/^\/+/, "")}`;
    return null;
  };

  if (!s.includes(";")) {
    const one = withScheme(s) ?? s;
    return one ? [one] : [];
  }

  const chunks = s.split(";").map((c) => c.trim());
  const urls: string[] = [];
  let acc = "";

  for (const piece of chunks) {
    if (!piece) continue;
    if (!acc) {
      acc = piece;
      continue;
    }
    const accOk = withScheme(acc);
    const pieceOk = withScheme(piece);
    if (accOk && pieceOk && cellLooksLikeStartOfUrl(piece)) {
      urls.push(accOk);
      acc = piece;
    } else {
      acc = `${acc};${piece}`;
    }
  }

  if (acc) {
    const last = withScheme(acc) ?? acc.trim();
    if (last) urls.push(last);
  }

  if (urls.length > 0) return urls;

  // Fallback: comma / pipe / newline (no semicolon list detected)
  return s
    .split(/[,;\n|]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => withScheme(x) ?? x);
}

/**
 * Write ImageKit URLs back into the cell using the same separator style as the original (prefer `;`).
 */
export function joinUrlsInCell(replacements: string[], originalCell: unknown): string {
  if (replacements.length === 0) return "";
  if (replacements.length === 1) return replacements[0] ?? "";

  const raw = String(originalCell ?? "");
  if (raw.includes(";")) {
    return /\s;\s|\s;|;\s/.test(raw) ? replacements.join("; ") : replacements.join(";");
  }
  if (raw.includes(",")) {
    return /,\s/.test(raw) ? replacements.join(", ") : replacements.join(",");
  }
  if (raw.includes("|")) {
    return /\|\s/.test(raw) ? replacements.join(" | ") : replacements.join("|");
  }
  return replacements.join(";");
}

export function filenameFromUrl(url: URL, fallback: string): string {
  try {
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(last)) {
      return last.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function normalizeMimeType(contentType: string | null, url: URL): string {
  const fromHeader = contentType?.split(";")[0]?.trim().toLowerCase();
  if (fromHeader && fromHeader.startsWith("image/")) return fromHeader;
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}
