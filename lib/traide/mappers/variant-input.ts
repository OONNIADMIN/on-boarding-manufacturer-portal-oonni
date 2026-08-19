import { asOptionalText, asRecord, asText, decimalString } from "./json";
import {
  attributesFromInventorySource,
  type TraideAttributeCatalogItem,
  type TraideAttributeInput,
} from "./attribute-input";
import { isLocalTraideId, TRAIDE_EXTERNAL_SOURCE, type InventoryProductLike } from "./product-input";

export type TraideProductVariantBulkCreateInput = {
  name: string;
  attributes: TraideAttributeInput[];
  currency: string;
  isDigital: boolean;
  isPriceOverrideAllowed: boolean;
  isPublished: boolean;
  isShippingRequired: boolean;
  overrideCurrency: boolean;
  price: string;
  costPrice: string;
  weight: string;
  dimensions?: { length: string; width: string; height: string };
  sku: string;
  externalId: string;
  externalSource: string;
  seller: string;
  trackInventory: boolean;
};

export type InventoryVariantLike = {
  id: number;
  inventory_product_id: number;
  nautical_id: string;
  name: string;
  sku: string | null;
  seo_description: string | null;
  attributes: unknown;
  payload: unknown;
  dimensions: unknown;
  product: InventoryProductLike;
};

function variantExternalId(variant: InventoryVariantLike): string | null {
  const payload = asRecord(variant.payload);
  return (
    asOptionalText(payload?.externalId) ||
    asOptionalText(payload?.external_id) ||
    (isLocalTraideId(variant.nautical_id) ? variant.nautical_id : null) ||
    asOptionalText(variant.sku)
  );
}

function dimensionsInput(value: unknown): TraideProductVariantBulkCreateInput["dimensions"] | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (rec.length == null && rec.width == null && rec.height == null) return undefined;
  return {
    length: decimalString(rec.length),
    width: decimalString(rec.width),
    height: decimalString(rec.height),
  };
}

export function toVariantBulkCreateInput(
  variant: InventoryVariantLike,
  options: {
    sellerId: string;
    catalog: TraideAttributeCatalogItem[];
  }
): { input: TraideProductVariantBulkCreateInput } | { error: string } {
  const sku = asOptionalText(variant.sku);
  if (!sku) {
    return { error: `Variant ${variant.id} is missing SKU` };
  }
  if (isLocalTraideId(variant.product.nautical_id)) {
    return {
      error: `Variant ${variant.id} parent product ${variant.product.id} is not in Traide yet. Upload products first.`,
    };
  }
  const externalId = variantExternalId(variant);
  if (!externalId) {
    return { error: `Variant ${variant.id} has no External ID, so Traide cannot upsert it` };
  }
  const payload = asRecord(variant.payload);
  const productPayload = asRecord(variant.product.payload);
  const input: TraideProductVariantBulkCreateInput = {
    name: variant.name,
    attributes: attributesFromInventorySource(variant, options.catalog),
    currency: variant.product.currency || asText(productPayload?.currency, "USD"),
    isDigital: variant.product.is_digital,
    isPriceOverrideAllowed: false,
    isPublished: variant.product.is_published,
    isShippingRequired: variant.product.is_shipping_required,
    overrideCurrency: false,
    price: decimalString(payload?.price ?? productPayload?.basePrice, "0"),
    costPrice: decimalString(payload?.costPrice, "0.0"),
    weight: decimalString(payload?.weight, "1"),
    sku,
    externalId,
    externalSource: TRAIDE_EXTERNAL_SOURCE,
    seller: options.sellerId,
    trackInventory: true,
    ...(dimensionsInput(variant.dimensions) ? { dimensions: dimensionsInput(variant.dimensions) } : {}),
  };
  return { input };
}
