import type { CatalogColumnRuleRecord } from "@/lib/catalog-column-validation";

/** Default catalog upload column rules (used for seeding and fallback). */
export const DEFAULT_CATALOG_COLUMN_RULES: Omit<
  CatalogColumnRuleRecord,
  "id" | "created_at" | "updated_at"
>[] = [
  { label: "sku", candidates: ["sku", "variant sku", "item sku", "product sku", "product sku code"], sort_order: 0, is_active: true },
  {
    label: "images",
    candidates: ["images", "image", "image url", "image urls", "image_url"],
    sort_order: 1,
    is_active: true,
  },
  {
    label: "description",
    candidates: ["description", "product description", "product_description"],
    sort_order: 2,
    is_active: true,
  },
  { label: "category", candidates: ["category"], sort_order: 3, is_active: true },
  {
    label: "title or name or product name",
    candidates: ["title", "name", "product name", "product_name"],
    sort_order: 4,
    is_active: true,
  },
  { label: "size", candidates: ["size"], sort_order: 5, is_active: true },
  { label: "color", candidates: ["color", "colour"], sort_order: 6, is_active: true },
  { label: "width", candidates: ["width", "product width"], sort_order: 7, is_active: true },
  { label: "height", candidates: ["height", "product height"], sort_order: 8, is_active: true },
  {
    label: "length or depth",
    candidates: ["length", "depth", "product length", "product depth"],
    sort_order: 9,
    is_active: true,
  },
];
