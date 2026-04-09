/** Normalize Excel/CSV header for comparison (trim, lowercase, collapse spaces). */
function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pick the SKU column from catalog headers. Matches the Nautical template primary name "sku"
 * and a few common variants.
 */
export function detectSkuColumn(columnNames: string[]): string | null {
  const trimmed = columnNames.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!trimmed.length) return null;
  const byNorm = new Map(trimmed.map((c) => [normalizeHeader(c), c]));
  const orderedCandidates = ["sku", "variant sku", "item sku", "product sku", "product sku code"];
  for (const cand of orderedCandidates) {
    const hit = byNorm.get(cand);
    if (hit) return hit;
  }
  for (const c of trimmed) {
    if (normalizeHeader(c) === "sku") return c;
  }
  return null;
}

/**
 * Pick the column that holds public image URLs. Template uses "images"; also matches common synonyms.
 * Never returns the same header as `skuColumn`.
 */
export function detectImageUrlColumn(columnNames: string[], skuColumn: string | null): string | null {
  const trimmed = columnNames.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!trimmed.length) return null;
  const skuNorm = skuColumn ? normalizeHeader(skuColumn) : "";
  const byNorm = new Map(trimmed.map((c) => [normalizeHeader(c), c]));
  const orderedCandidates = [
    "images",
    "image",
    "image url",
    "image_url",
    "image urls",
    "product images",
    "main image",
    "gallery",
  ];
  for (const cand of orderedCandidates) {
    const col = byNorm.get(cand);
    if (col && normalizeHeader(col) !== skuNorm) return col;
  }
  for (const c of trimmed) {
    const n = normalizeHeader(c);
    if (n === skuNorm) continue;
    if (n.includes("image")) return c;
  }
  return null;
}
