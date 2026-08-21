import {
  attachRequiredCatalogAttributes,
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

export function resolveCatalogAttributes(
  source: { attributes?: unknown; payload?: unknown },
  catalog: AttributeCatalogItem[]
): MappedInventoryAttribute[] {
  return attachRequiredCatalogAttributes(resolveInventoryAttributes(source), catalog);
}
