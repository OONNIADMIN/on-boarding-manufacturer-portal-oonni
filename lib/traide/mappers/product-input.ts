import { LOCAL_INVENTORY_PREFIX } from "@/lib/inventory-access";
import { asOptionalText, asRecord, asText, decimalString, namedField } from "./json";
import {
  attributesFromInventorySource,
  type TraideAttributeCatalogItem,
  type TraideAttributeInput,
} from "./attribute-input";

const PRODUCT_SUB_STATUSES = new Set(["IN_REVIEW", "APPROVED", "REJECTED", "DISABLED"]);
const PRODUCT_TYPE_GLOBAL_ID_PREFIX = "UHJvZHVjdFR5cGU6";
const CATEGORY_GLOBAL_ID_PREFIX = "Q2F0ZWdvcnk6";

function resolveProductSubStatus(value: unknown): string {
  const raw = asText(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (PRODUCT_SUB_STATUSES.has(raw)) return raw;
  return "IN_REVIEW";
}
export const TRAIDE_EXTERNAL_SOURCE = "oonni-manufacturer-portal";

export type TraideProductBulkCreateInput = {
  name: string;
  slug: string;
  description: string;
  descriptionHtml: string;
  category?: string;
  productType: string;
  attributes: TraideAttributeInput[];
  chargeTaxes: boolean;
  collections: string[];
  currency: string;
  isPublished: boolean;
  taxCode: string;
  weight: string;
  seo: { title: string; description: string };
  trackInventory: boolean;
  visibleInListings: boolean;
  overridePrice: boolean;
  overrideCurrency: boolean;
  subStatus: string;
  subStatusReason: string;
  isShippingRequired: boolean;
  isPriceOverrideAllowed: boolean;
  isAvailable: boolean;
  seller: string;
  basePrice: string;
  externalSource: string;
  externalId: string;
  dimensions?: { length: string; width: string; height: string };
};

/** Fields accepted by Traide `ProductInput` (productUpdate). Bulk-create-only keys are omitted. */
export type TraideProductUpdateInput = {
  name: string;
  slug: string;
  description: string;
  descriptionHtml: string;
  category?: string;
  attributes: TraideAttributeInput[];
  currency: string;
  seo: { title: string; description: string };
};

export type ProductTypeLookup = {
  id: string;
  slug: string;
  name: string;
  productAttributes?: TraideAttributeCatalogItem[];
  variantAttributes?: TraideAttributeCatalogItem[];
};

export type InventoryProductLike = {
  id: number;
  name: string;
  slug: string;
  nautical_id: string;
  external_id: string | null;
  description: string | null;
  description_html: string | null;
  currency: string | null;
  seo_title: string | null;
  seo_description: string | null;
  is_digital: boolean;
  is_shipping_required: boolean;
  is_published: boolean;
  available_for_purchase: boolean;
  status: string | null;
  category: unknown;
  product_type: unknown;
  attributes: unknown;
  payload: unknown;
  dimensions: unknown;
};

export function isLocalTraideId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(LOCAL_INVENTORY_PREFIX));
}

export function isProductTypeGlobalId(value: string | null | undefined): boolean {
  const text = asText(value);
  return text.startsWith(PRODUCT_TYPE_GLOBAL_ID_PREFIX) && text.length > PRODUCT_TYPE_GLOBAL_ID_PREFIX.length;
}

export function isCategoryGlobalId(value: string | null | undefined): boolean {
  const text = asText(value);
  return text.startsWith(CATEGORY_GLOBAL_ID_PREFIX) && text.length > CATEGORY_GLOBAL_ID_PREFIX.length;
}

export function resolveProductExternalId(product: InventoryProductLike): string | null {
  const payload = asRecord(product.payload);
  return (
    asOptionalText(product.external_id) ||
    asOptionalText(payload?.externalId) ||
    asOptionalText(payload?.external_id) ||
    (isLocalTraideId(product.nautical_id) ? product.nautical_id : null)
  );
}

export function resolveProductExternalSource(product: InventoryProductLike): string {
  const payload = asRecord(product.payload);
  return asOptionalText(payload?.externalSource) || asOptionalText(payload?.external_source) || TRAIDE_EXTERNAL_SOURCE;
}

export function resolveProductTypeId(
  product: InventoryProductLike,
  catalog: ProductTypeLookup[]
): string | null {
  const payload = asRecord(product.payload);
  const stored = product.product_type ?? payload?.productType;
  const storedId = namedField(stored, "id");
  if (isProductTypeGlobalId(storedId)) return storedId;
  if (storedId) {
    const byId = catalog.find((item) => item.id === storedId);
    if (byId) return byId.id;
  }
  const needle = (namedField(stored, "name") || namedField(stored, "slug") || "").toLowerCase();
  if (!needle) return null;
  const match = catalog.find((item) => item.name.toLowerCase() === needle || item.slug.toLowerCase() === needle);
  return match?.id ?? null;
}

function resolveCategoryId(product: InventoryProductLike): string | undefined {
  const payload = asRecord(product.payload);
  const stored = product.category ?? payload?.category;
  const id = namedField(stored, "id");
  return isCategoryGlobalId(id) ? id ?? undefined : undefined;
}

function dimensionsInput(value: unknown): TraideProductBulkCreateInput["dimensions"] | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (rec.length == null && rec.width == null && rec.height == null) return undefined;
  return {
    length: decimalString(rec.length),
    width: decimalString(rec.width),
    height: decimalString(rec.height),
  };
}

export function toProductBulkCreateInput(
  product: InventoryProductLike,
  options: {
    sellerId: string;
    productTypes: ProductTypeLookup[];
  }
): { input: TraideProductBulkCreateInput; productType: ProductTypeLookup | null } | { error: string } {
  const productTypeId = resolveProductTypeId(product, options.productTypes);
  if (!productTypeId) {
    return { error: `Product ${product.id} is missing a Traide product type id` };
  }
  const externalId = resolveProductExternalId(product);
  if (!externalId) {
    return {
      error: `Product ${product.id} ("${product.name}") has no External ID, so Traide cannot upsert it`,
    };
  }
  const productType = options.productTypes.find((item) => item.id === productTypeId) ?? null;
  const payload = asRecord(product.payload);
  const category = resolveCategoryId(product);
  const input: TraideProductBulkCreateInput = {
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    descriptionHtml: product.description_html || product.description || "",
    ...(category ? { category } : {}),
    productType: productTypeId,
    attributes: attributesFromInventorySource(product, productType?.productAttributes ?? []),
    chargeTaxes: true,
    collections: [],
    currency: product.currency || "USD",
    isPublished: product.is_published,
    taxCode: asText(payload?.taxCode),
    weight: decimalString(payload?.weight, "0.0"),
    seo: {
      title: product.seo_title || product.name || "No Title",
      description: product.seo_description || "",
    },
    trackInventory: true,
    visibleInListings: true,
    overridePrice: false,
    overrideCurrency: false,
    subStatus: resolveProductSubStatus(payload?.subStatus),
    subStatusReason: asText(payload?.subStatusReason),
    isShippingRequired: product.is_shipping_required,
    isPriceOverrideAllowed: false,
    isAvailable: product.available_for_purchase,
    seller: options.sellerId,
    basePrice: decimalString(payload?.basePrice, "0.0"),
    externalSource: resolveProductExternalSource(product),
    externalId,
    ...(dimensionsInput(product.dimensions) ? { dimensions: dimensionsInput(product.dimensions) } : {}),
  };
  return { input, productType };
}

export function toProductUpdateInput(
  product: InventoryProductLike,
  options: {
    sellerId: string;
    productTypes: ProductTypeLookup[];
  }
): { id: string; input: TraideProductUpdateInput } | { error: string } {
  if (isLocalTraideId(product.nautical_id) || !asText(product.nautical_id)) {
    return { error: `Product ${product.id} has no Traide id to update` };
  }
  const mapped = toProductBulkCreateInput(product, options);
  if ("error" in mapped) return mapped;
  const { input } = mapped;
  const update: TraideProductUpdateInput = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    descriptionHtml: input.descriptionHtml,
    ...(input.category ? { category: input.category } : {}),
    attributes: input.attributes,
    currency: input.currency,
    seo: input.seo,
  };
  return { id: product.nautical_id, input: update };
}
