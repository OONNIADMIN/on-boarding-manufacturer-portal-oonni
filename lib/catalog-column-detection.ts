import {
  findCatalogColumn,
  normalizeCatalogHeader,
  resolveCatalogColumnForRule,
  type CatalogColumnRuleRecord,
} from "@/lib/catalog-column-validation";

const FALLBACK_SKU_CANDIDATES = [
  "sku",
  "variant sku",
  "item sku",
  "product sku",
  "product sku code",
  "product #",
  "product number",
  "item #",
  "item number",
  "part #",
];

const FALLBACK_IMAGE_CANDIDATES = [
  "images",
  "image",
  "image url",
  "image_url",
  "image urls",
  "product images",
  "main image",
  "gallery",
  "imagenes",
  "imágenes",
  "imagen",
  "imagen url",
  "url imagen",
  "url imagenes",
  "fotos",
  "foto",
  "photo",
  "photos",
  "picture",
  "pictures",
  "media",
  "thumbnail",
  "thumbnails",
];

const IMAGE_HEADER_HINTS = [
  "image",
  "imagen",
  "img",
  "photo",
  "foto",
  "picture",
  "gallery",
  "media",
  "thumbnail",
];

/** "image" matches "image 1", "image-2", "image1"; exact names still win first. */
function headerMatchesImageCandidate(headerNorm: string, candidateNorm: string): boolean {
  if (!candidateNorm || !headerNorm) return false;
  if (headerNorm === candidateNorm) return true;
  if (headerNorm.startsWith(`${candidateNorm} `)) return true;
  const rest = headerNorm.slice(candidateNorm.length);
  return headerNorm.startsWith(candidateNorm) && /^\d+$/.test(rest);
}

/**
 * Pick the SKU column from catalog headers using column rules when available,
 * otherwise common header name variants.
 */
export function detectSkuColumn(
  columnNames: string[],
  rules?: CatalogColumnRuleRecord[]
): string | null {
  if (rules?.length) {
    const fromRules = resolveCatalogColumnForRule(columnNames, rules, "sku");
    if (fromRules) return fromRules;
  }

  return findCatalogColumn(columnNames, FALLBACK_SKU_CANDIDATES);
}

/** Data rows after the header used to decide if a column holds image URLs. */
export const IMAGE_COLUMN_SAMPLE_ROWS = 10;

const IMAGE_FILE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const NON_IMAGE_EXT_RE =
  /\.(pdf|mp4|mov|webm|avi|m4v|mp3|wav|zip|docx?|xlsx?|pptx?|csv|txt)(\?|#|$)/i;
const IMAGE_PATH_RE = /\/(images?|imgs?|imagenes|imágenes|photos?|fotos?|pictures?|media|gallery|thumbnails?|assets)\b/i;
const IMAGE_HOST_RE =
  /imagekit\.io|ik\.imagekit|cloudinary|imgix|images\.|img\.|cdn\.shopify|googleusercontent|unsplash|pexels/i;

function headerLooksLikeImage(normalized: string): boolean {
  if (FALLBACK_IMAGE_CANDIDATES.some((cand) => headerMatchesImageCandidate(normalized, cand))) {
    return true;
  }
  return IMAGE_HEADER_HINTS.some((hint) => {
    const re = new RegExp(`(^|[^a-z])${hint}s?([^a-z]|$)`);
    return re.test(normalized);
  });
}

function looksLikeHttpUrl(value: string): boolean {
  return /https?:\/\//i.test(value) || value.startsWith("//");
}

/** True when a cell contains an http(s) URL with .jpg/.png or another image pattern. */
export function cellLooksLikeImageUrl(cell: unknown): boolean {
  const raw = String(cell ?? "").trim();
  if (!raw) return false;

  const parts = [raw, ...raw.split(/[\s,;|]+/).map((part) => part.trim()).filter(Boolean)];
  return parts.some((part) => {
    if (!looksLikeHttpUrl(part) || NON_IMAGE_EXT_RE.test(part)) return false;
    if (IMAGE_FILE_EXT_RE.test(part)) return true;
    return IMAGE_PATH_RE.test(part) || IMAGE_HOST_RE.test(part);
  });
}

function columnHasImageUrlInSample(sampleRows: string[][], col: number, limit: number): boolean {
  const rows = sampleRows.slice(0, limit);
  return rows.some((row) => cellLooksLikeImageUrl(row?.[col]));
}

/**
 * All spreadsheet headers that hold image URLs (Image 1, Image 2, images, fotos, …).
 * Never includes the SKU column.
 */
export function detectImageUrlColumns(
  columnNames: string[],
  skuColumn: string | null,
  rules?: CatalogColumnRuleRecord[],
  sampleRows?: string[][]
): string[] {
  const skuNorm = skuColumn ? normalizeCatalogHeader(skuColumn) : "";
  const headers = columnNames.map((c) => String(c ?? "").trim());
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (header: string | null | undefined) => {
    const name = String(header ?? "").trim();
    if (!name) return;
    const n = normalizeCatalogHeader(name);
    if (!n || n === skuNorm || seen.has(n)) return;
    seen.add(n);
    found.push(name);
  };

  const imageRule = rules?.find((r) => r.is_active && r.label.trim().toLowerCase() === "images");
  const sample = sampleRows?.slice(0, IMAGE_COLUMN_SAMPLE_ROWS) ?? [];

  for (let col = 0; col < headers.length; col++) {
    const header = headers[col];
    if (!header) continue;
    const n = normalizeCatalogHeader(header);

    if (sample.length) {
      if (columnHasImageUrlInSample(sample, col, IMAGE_COLUMN_SAMPLE_ROWS)) add(header);
      continue;
    }

    if (
      imageRule?.candidates.some((cand) =>
        headerMatchesImageCandidate(n, normalizeCatalogHeader(cand))
      )
    ) {
      add(header);
      continue;
    }

    if (headerLooksLikeImage(n)) add(header);
  }

  return found;
}

/**
 * Pick the first image-URL column. Prefer `detectImageUrlColumns` when a file
 * can have Image 1, Image 2, gallery, etc.
 */
export function detectImageUrlColumn(
  columnNames: string[],
  skuColumn: string | null,
  rules?: CatalogColumnRuleRecord[],
  sampleRows?: string[][]
): string | null {
  return detectImageUrlColumns(columnNames, skuColumn, rules, sampleRows)[0] ?? null;
}
