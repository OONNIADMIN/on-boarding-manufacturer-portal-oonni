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
];

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

/**
 * Pick the column that holds public image URLs using column rules when available.
 * Never returns the same header as `skuColumn`.
 */
export function detectImageUrlColumn(
  columnNames: string[],
  skuColumn: string | null,
  rules?: CatalogColumnRuleRecord[]
): string | null {
  const skuNorm = skuColumn ? normalizeCatalogHeader(skuColumn) : "";

  if (rules?.length) {
    const fromRules = resolveCatalogColumnForRule(columnNames, rules, "images");
    if (fromRules && normalizeCatalogHeader(fromRules) !== skuNorm) return fromRules;
  }

  const fromFallback = findCatalogColumn(columnNames, FALLBACK_IMAGE_CANDIDATES);
  if (fromFallback && normalizeCatalogHeader(fromFallback) !== skuNorm) return fromFallback;

  const trimmed = columnNames.map((c) => String(c ?? "").trim()).filter(Boolean);
  for (const c of trimmed) {
    const n = normalizeCatalogHeader(c);
    if (n === skuNorm) continue;
    if (n.includes("image")) return c;
  }

  return null;
}
