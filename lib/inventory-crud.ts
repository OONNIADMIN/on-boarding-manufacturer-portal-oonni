import { Prisma } from "@prisma/client";
import { slugify } from "@/lib/api-response";
import { mergeInventoryAttributes, persistInventoryAttributes } from "@/lib/inventory-attributes";

export type AttributeInput = {
  name: string;
  value: string;
  id?: string | null;
  slug?: string | null;
  inputType?: string | null;
};

export type ProductWriteInput = {
  name: string;
  slug: string;
  external_id: string | null;
  status: string | null;
  is_published: boolean;
  available_for_purchase: boolean;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  category: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  product_type: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  attributes: Prisma.InputJsonValue;
};

export type VariantWriteInput = {
  name: string;
  sku: string | null;
  seo_description: string | null;
  dimensions: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  attributes: Prisma.InputJsonValue;
};

export type InventoryImage = { id?: string | null; url?: string | null };

function imageFromUnknown(item: unknown): InventoryImage | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const nested = row.node && typeof row.node === "object" ? (row.node as Record<string, unknown>) : row;
  const url = String(nested.url ?? nested.originalUrl ?? nested.original_url ?? "").trim();
  const id = nested.id == null ? null : String(nested.id);
  if (!url && !id) return null;
  return { id, url: url || null };
}

export function normalizeInventoryImages(value: unknown): InventoryImage[] {
  if (Array.isArray(value)) {
    return value.map(imageFromUnknown).filter((item): item is InventoryImage => Boolean(item));
  }
  if (value && typeof value === "object" && Array.isArray((value as { edges?: unknown }).edges)) {
    return ((value as { edges: unknown[] }).edges)
      .map(imageFromUnknown)
      .filter((item): item is InventoryImage => Boolean(item));
  }
  return [];
}

/** Prefer the `images` column; fall back to variant payload, parent product payload, then product images. */
export function resolveVariantImages(
  variant: { images?: unknown; payload?: unknown; nautical_id?: string | null },
  productPayload?: unknown,
  productImages?: unknown
): InventoryImage[] {
  const fromColumn = normalizeInventoryImages(variant.images);
  if (fromColumn.length) return fromColumn;

  if (variant.payload && typeof variant.payload === "object") {
    const fromVariantPayload = collectNodeImages(variant.payload);
    if (fromVariantPayload.length) return fromVariantPayload;
  }

  if (productPayload && typeof productPayload === "object" && variant.nautical_id) {
    const nested = (productPayload as { variants?: unknown }).variants;
    if (Array.isArray(nested)) {
      const match = nested.find((item) => {
        if (!item || typeof item !== "object") return false;
        return String((item as { id?: unknown }).id ?? "") === variant.nautical_id;
      });
      const fromMatch = match && typeof match === "object" ? collectNodeImages(match) : [];
      if (fromMatch.length) return fromMatch;
      if (nested.length === 1) {
        const only = collectNodeImages(nested[0]);
        if (only.length) return only;
      }
    }
  }

  return normalizeInventoryImages(productImages);
}

function collectNodeImages(node: unknown): InventoryImage[] {
  if (!node || typeof node !== "object") return [];
  const row = node as { images?: unknown; media?: unknown };
  const fromImages = normalizeInventoryImages(row.images);
  if (fromImages.length) return fromImages;
  return normalizeInventoryImages(row.media);
}

function asOptionalString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function parseAttributes(value: unknown): AttributeInput[] {
  return persistInventoryAttributes(value).map((attr) => ({
    name: attr.name,
    value: attr.value,
    id: attr.id,
    slug: attr.slug,
    inputType: attr.inputType,
  }));
}

export function attributesToJson(
  attrs: AttributeInput[],
  existing?: unknown
): Prisma.InputJsonValue {
  return mergeInventoryAttributes(existing, attrs);
}

function namedJson(name: string | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!name) return Prisma.JsonNull;
  return { name };
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function parseProductInput(
  body: unknown,
  options: { requireName: boolean; fallbackName?: string; existingAttributes?: unknown }
): ProductWriteInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid payload" };
  const data = body as Record<string, unknown>;
  const name = String(data.name ?? options.fallbackName ?? "").trim();
  if (options.requireName && !name) return { error: "Name is required" };
  if (name.length > 500) return { error: "Name is too long" };

  const slugSource = asOptionalString(data.slug) || name;
  const slug = slugify(slugSource) || `product-${Date.now()}`;
  if (slug.length > 255) return { error: "Slug is too long" };

  const isPublished = asBoolean(data.is_published, false);
  const status = asOptionalString(data.status) || (isPublished ? "PUBLISHED" : "DRAFT");
  const attributes = parseAttributes(data.attributes);

  return {
    name,
    slug,
    external_id: asOptionalString(data.external_id),
    status,
    is_published: isPublished,
    available_for_purchase: asBoolean(data.available_for_purchase, true),
    description: asOptionalString(data.description),
    seo_title: asOptionalString(data.seo_title),
    seo_description: asOptionalString(data.seo_description),
    category: namedJson(asOptionalString(data.category_name)),
    product_type: namedJson(asOptionalString(data.product_type_name)),
    attributes: attributesToJson(attributes, options.existingAttributes),
  };
}

export function parseVariantInput(
  body: unknown,
  options: { requireName: boolean; fallbackName?: string; existingAttributes?: unknown }
): VariantWriteInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid payload" };
  const data = body as Record<string, unknown>;
  const name = String(data.name ?? options.fallbackName ?? "").trim();
  if (options.requireName && !name) return { error: "Name is required" };
  if (name.length > 500) return { error: "Name is too long" };

  const length = parseNumber(data.length);
  const width = parseNumber(data.width);
  const height = parseNumber(data.height);
  const unit = asOptionalString(data.unit) || "in";
  const hasDimensions = length != null || width != null || height != null;
  const attributes = parseAttributes(data.attributes);

  return {
    name,
    sku: asOptionalString(data.sku),
    seo_description: asOptionalString(data.seo_description),
    dimensions: hasDimensions ? { length, width, height, unit } : Prisma.JsonNull,
    attributes: attributesToJson(attributes, options.existingAttributes),
  };
}

export function categoryName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as { name?: unknown }).name ?? "").trim();
}
