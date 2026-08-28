import {
  attachRequiredCatalogAttributes,
  attributeMatchesCatalog,
  resolveInventoryAttributes,
  type AttributeCatalogItem,
  type MappedInventoryAttribute,
} from "@/lib/inventory-attributes";
import {
  fetchAllNauticalProductTypes,
  type NauticalProductTypeNode,
} from "@/lib/traide/operations/product-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function productTypeId(value: unknown): string | null {
  const row = asRecord(value);
  const id = String(row?.id ?? "").trim();
  return id || null;
}

function toCatalog(items: NauticalProductTypeNode["productAttributes"] | undefined): AttributeCatalogItem[] {
  if (!items?.length) return [];
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug ?? null,
    inputType: item.inputType ?? null,
    valueRequired: Boolean(item.valueRequired),
  }));
}

export async function loadProductTypeCatalogs(): Promise<NauticalProductTypeNode[]> {
  try {
    return await fetchAllNauticalProductTypes();
  } catch {
    return [];
  }
}

export function catalogForProductType(
  types: NauticalProductTypeNode[],
  productType: unknown,
  kind: "product" | "variant"
): AttributeCatalogItem[] {
  const id = productTypeId(productType);
  if (!id) return [];
  const node = types.find((type) => type.id === id);
  if (!node) return [];
  return toCatalog(kind === "product" ? node.productAttributes : node.variantAttributes);
}

/** Union of product or variant attributes across every Traide product type. */
export function catalogsFromProductTypes(
  types: NauticalProductTypeNode[],
  kind: "product" | "variant"
): AttributeCatalogItem[] {
  const seen = new Map<string, AttributeCatalogItem>();
  for (const node of types) {
    for (const item of toCatalog(kind === "product" ? node.productAttributes : node.variantAttributes)) {
      const key = item.id || item.name.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, item);
    }
  }
  return [...seen.values()];
}

export function resolveCatalogAttributes(
  source: { attributes?: unknown; payload?: unknown },
  catalog: AttributeCatalogItem[]
): MappedInventoryAttribute[] {
  return attachRequiredCatalogAttributes(resolveInventoryAttributes(source), catalog);
}

/**
 * Product export/UI should only keep product-type attributes.
 * Variant export/UI should only keep variant-type attributes.
 * Stored JSON sometimes mixes both; excludeCatalog drops the other kind.
 */
export function resolveScopedCatalogAttributes(
  source: { attributes?: unknown; payload?: unknown },
  catalog: AttributeCatalogItem[],
  excludeCatalog: AttributeCatalogItem[] = []
): MappedInventoryAttribute[] {
  const stored = resolveInventoryAttributes(source);
  const scoped = stored.filter((attr) => {
    const inCatalog = catalog.length ? attributeMatchesCatalog(attr, catalog) : false;
    const inExcluded = excludeCatalog.length ? attributeMatchesCatalog(attr, excludeCatalog) : false;
    if (catalog.length) return inCatalog;
    return !inExcluded;
  });
  return attachRequiredCatalogAttributes(scoped, catalog);
}
