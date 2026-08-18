import { Prisma } from "@prisma/client";
import { slugify } from "@/lib/api-response";

export type AttributeInput = { name: string; value: string };

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
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      if (!name) return null;
      const nested = Array.isArray(row.values) ? row.values[0] : null;
      const nestedValue =
        nested && typeof nested === "object"
          ? String((nested as { name?: unknown; value?: unknown }).name ?? (nested as { value?: unknown }).value ?? "").trim()
          : "";
      const parsed = String(row.value ?? "").trim() || nestedValue;
      return { name, value: parsed };
    })
    .filter((row): row is AttributeInput => Boolean(row));
}

export function attributesToJson(attrs: AttributeInput[]): Prisma.InputJsonValue {
  return attrs.map((attr) => ({
    name: attr.name,
    value: attr.value,
    values: attr.value ? [{ name: attr.value, value: attr.value }] : [],
  }));
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
  options: { requireName: boolean; fallbackName?: string }
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
    attributes: attributesToJson(attributes),
  };
}

export function parseVariantInput(
  body: unknown,
  options: { requireName: boolean; fallbackName?: string }
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
    attributes: attributesToJson(attributes),
  };
}

export function categoryName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as { name?: unknown }).name ?? "").trim();
}
