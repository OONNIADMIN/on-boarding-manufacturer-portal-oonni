import { randomBytes } from "crypto";

const LOCAL_ID_PREFIX = "local:";
const PRODUCT_IMAGE_GLOBAL_ID_PREFIX = "UHJvZHVjdEltYWdlOg";
const PRODUCT_MEDIA_GLOBAL_ID_PREFIX = "UHJvZHVjdE1lZGlhOg";

export type TraideVariantImageInput = {
  url: string;
  source: string;
  code: string;
  id?: string | null;
};

/** Any Traide GraphQL image/media id. Do not require ProductImage: only — create can return ProductMedia:. */
export function isTraideImageId(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim();
  if (!text || text.startsWith(LOCAL_ID_PREFIX) || /^https?:\/\//i.test(text)) return false;
  return (
    text.startsWith(PRODUCT_IMAGE_GLOBAL_ID_PREFIX) ||
    text.startsWith(PRODUCT_MEDIA_GLOBAL_ID_PREFIX) ||
    text.length >= 12
  );
}

export function isTraideProductImageId(value: string | null | undefined): boolean {
  return isTraideImageId(value);
}

export function imageMatchKey(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const href = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const parsed = new URL(href);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

export function generateImageExternalId(): string {
  return randomBytes(12).toString("base64url").replace(/=+$/g, "");
}

function looksLikeImageUrl(value: string): boolean {
  return /cloudinary\.com|imagekit\.io|\/image\/|\.jpg|\.jpeg|\.png|\.webp|\.gif/i.test(value);
}

function normalizeImageUrl(raw: string): string | null {
  let candidate = raw.trim();
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (candidate.startsWith("//")) return `https:${candidate}`;
  if (looksLikeImageUrl(candidate)) return `https://${candidate.replace(/^\/+/, "")}`;
  return null;
}

function urlsFromText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  for (const separator of [";", ",", "|", "\n"] as const) {
    if (trimmed.includes(separator)) {
      return trimmed.split(separator).map((part) => part.trim()).filter(Boolean);
    }
  }
  return [trimmed];
}

/**
 * Parse variant images the same way oonni-integration-middleware `parse_variant_images` does:
 * list of urls, list of `{ url }`, or a string split on `;`, `,`, `|`.
 */
export function parseVariantImages(raw: unknown, existing: unknown = []): TraideVariantImageInput[] {
  const previous = Array.isArray(existing)
    ? existing.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const parsedUrls: string[] = [];

  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const url = normalizeImageUrl(String(rec.url ?? ""));
        if (url) parsedUrls.push(url);
        continue;
      }
      const url = normalizeImageUrl(String(item ?? ""));
      if (url) parsedUrls.push(url);
    }
  } else if (typeof raw === "string") {
    for (const part of urlsFromText(raw)) {
      const url = normalizeImageUrl(part);
      if (url) parsedUrls.push(url);
    }
  } else {
    return [];
  }

  const seen = new Set<string>();
  const normalized: TraideVariantImageInput[] = [];
  for (const url of parsedUrls) {
    const key = imageMatchKey(url);
    if (seen.has(key || url)) continue;
    seen.add(key || url);
    const match = findImageRecord(previous, url);
    const fromRaw = Array.isArray(raw) ? findImageRecord(raw, url) : undefined;
    const rawId = fromRaw?.id == null ? "" : String(fromRaw.id);
    const matchId = match?.id == null ? "" : String(match.id);
    const id = isTraideImageId(rawId) ? rawId : isTraideImageId(matchId) ? matchId : null;
    normalized.push({
      url,
      source: String(match?.source ?? match?.externalSource ?? "imagekit"),
      code: String(match?.code ?? match?.externalId ?? generateImageExternalId()),
      id,
    });
  }
  return normalized;
}

function findImageRecord(items: unknown[], url: string): Record<string, unknown> | undefined {
  const key = imageMatchKey(url);
  const records = items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  return (
    records.find((item) => String(item.url ?? "").trim() === url) ??
    records.find((item) => imageMatchKey(String(item.url ?? "")) === key)
  );
}

/** Recover Traide image ids from a GraphQL node (`images` / `media`) or a stored JSON column. */
export function collectImageRecords(raw: unknown): TraideVariantImageInput[] {
  if (raw == null) return [];
  if (Array.isArray(raw) || typeof raw === "string") return parseVariantImages(raw, raw);
  if (typeof raw === "object") {
    const node = raw as { images?: unknown; media?: unknown };
    const fromImages = parseVariantImages(node.images, node.images);
    if (fromImages.length) return fromImages;
    return parseVariantImages(node.media, node.media);
  }
  return [];
}

export function toInventoryImages(images: TraideVariantImageInput[]): Array<{ id: string | null; url: string }> {
  return images.map((image) => ({ id: image.id ?? null, url: image.url }));
}
