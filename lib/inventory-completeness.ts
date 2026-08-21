import { resolveVariantImages } from "@/lib/inventory-crud";
import { persistInventoryAttributes, resolveInventoryAttributes, visibleAttributeText } from "@/lib/inventory-attributes";

export const MIN_DESCRIPTION_LENGTH = 30;

export type CompletenessIssueKind = "empty" | "na" | "zero" | "short";
export type CompletenessStatus = "complete" | "needs_review" | "incomplete";

export type CompletenessIssue = {
  field: string;
  kind: CompletenessIssueKind;
  message: string;
};

export type CompletenessReport = {
  total_fields: number;
  valid_fields: number;
  empty_count: number;
  na_count: number;
  zero_count: number;
  short_count: number;
  percent: number;
  status: CompletenessStatus;
  issues: CompletenessIssue[];
};

export type EntityCompleteness = CompletenessReport & {
  entity: "product" | "variant";
  id: number;
  label: string;
};

export type ProductCompleteness = CompletenessReport & {
  product: EntityCompleteness;
  variants: EntityCompleteness[];
};

type SlotKind = "text" | "numeric" | "description" | "image";

function attributeSlotKind(inputType: string | null | undefined): SlotKind {
  const type = String(inputType ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  if (type === "NUMERIC" || type === "METRIC" || type === "MONEY") return "numeric";
  if (type === "RICH_TEXT") return "description";
  return "text";
}

const NA_PATTERN = /^(n\/a|n\.a\.?|na|not applicable|none|null|-|—)$/i;

function namedValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name ?? "").trim();
  }
  return String(value).trim();
}

function imageUrl(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as { url?: unknown }).url ?? "").trim();
}

function classify(raw: unknown, kind: SlotKind): CompletenessIssueKind | null {
  if (kind === "image") {
    const urls = Array.isArray(raw) ? raw.map(imageUrl).filter(Boolean) : [imageUrl(raw)].filter(Boolean);
    if (!urls.length) return "empty";
    if (urls.every((url) => NA_PATTERN.test(url))) return "na";
    return null;
  }

  if (raw == null) return "empty";
  const text = String(raw).trim();
  const visible = visibleAttributeText(text);
  if (!text || !visible) return "empty";
  if (NA_PATTERN.test(visible)) return "na";

  if (kind === "numeric") {
    const num = Number(visible);
    if (!Number.isFinite(num)) return "empty";
    if (num === 0) return "zero";
    return null;
  }

  if (kind === "description" && visible.length < MIN_DESCRIPTION_LENGTH) return "short";
  return null;
}

function issueMessage(field: string, kind: CompletenessIssueKind): string {
  if (kind === "empty") return `${field} is empty`;
  if (kind === "na") return `${field} is N/A`;
  if (kind === "zero") return `${field} is 0`;
  return `${field} is too short (under ${MIN_DESCRIPTION_LENGTH} characters)`;
}

function scoreSlots(slots: Array<{ field: string; value: unknown; kind: SlotKind }>): CompletenessReport {
  const issues: CompletenessIssue[] = [];
  let empty_count = 0;
  let na_count = 0;
  let zero_count = 0;
  let short_count = 0;

  for (const slot of slots) {
    const kind = classify(slot.value, slot.kind);
    if (!kind) continue;
    issues.push({ field: slot.field, kind, message: issueMessage(slot.field, kind) });
    if (kind === "empty") empty_count += 1;
    if (kind === "na") na_count += 1;
    if (kind === "zero") zero_count += 1;
    if (kind === "short") short_count += 1;
  }

  const total_fields = slots.length;
  const valid_fields = total_fields - issues.length;
  const percent = total_fields === 0 ? 100 : Math.round((valid_fields / total_fields) * 100);
  const status: CompletenessStatus = percent >= 90 ? "complete" : percent >= 60 ? "needs_review" : "incomplete";

  return {
    total_fields,
    valid_fields,
    empty_count,
    na_count,
    zero_count,
    short_count,
    percent,
    status,
    issues,
  };
}

function attributesForCompleteness(source: { attributes?: unknown; payload?: unknown }) {
  const stored = persistInventoryAttributes(source.attributes);
  if (stored.length) return stored;
  return resolveInventoryAttributes(source);
}

function dimensionValue(dimensions: unknown, key: "length" | "width" | "height"): unknown {
  if (!dimensions || typeof dimensions !== "object") return null;
  return (dimensions as Record<string, unknown>)[key];
}

function mergeReports(parts: CompletenessReport[]): CompletenessReport {
  const total_fields = parts.reduce((sum, part) => sum + part.total_fields, 0);
  const valid_fields = parts.reduce((sum, part) => sum + part.valid_fields, 0);
  const empty_count = parts.reduce((sum, part) => sum + part.empty_count, 0);
  const na_count = parts.reduce((sum, part) => sum + part.na_count, 0);
  const zero_count = parts.reduce((sum, part) => sum + part.zero_count, 0);
  const short_count = parts.reduce((sum, part) => sum + part.short_count, 0);
  const percent = total_fields === 0 ? 100 : Math.round((valid_fields / total_fields) * 100);
  const status: CompletenessStatus = percent >= 90 ? "complete" : percent >= 60 ? "needs_review" : "incomplete";
  return {
    total_fields,
    valid_fields,
    empty_count,
    na_count,
    zero_count,
    short_count,
    percent,
    status,
    issues: parts.flatMap((part) => part.issues),
  };
}

type ProductLike = {
  id: number;
  name?: string | null;
  slug?: string | null;
  external_id?: string | null;
  status?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  images?: unknown;
  category?: unknown;
  product_type?: unknown;
  dimensions?: unknown;
  attributes?: unknown;
  payload?: unknown;
};

type VariantLike = {
  id: number;
  nautical_id?: string | null;
  name?: string | null;
  sku?: string | null;
  seo_description?: string | null;
  images?: unknown;
  payload?: unknown;
  dimensions?: unknown;
  attributes?: unknown;
};

export function evaluateVariantCompleteness(
  variant: VariantLike,
  productPayload?: unknown,
  productImages?: unknown
): EntityCompleteness {
  const attributes = attributesForCompleteness(variant);
  const images = resolveVariantImages(variant, productPayload, productImages);
  const report = scoreSlots([
    { field: "Name", value: variant.name, kind: "text" },
    { field: "SKU", value: variant.sku, kind: "text" },
    { field: "Images", value: images, kind: "image" },
    { field: "SEO description", value: variant.seo_description, kind: "description" },
    { field: "Length", value: dimensionValue(variant.dimensions, "length"), kind: "numeric" },
    { field: "Width", value: dimensionValue(variant.dimensions, "width"), kind: "numeric" },
    { field: "Height", value: dimensionValue(variant.dimensions, "height"), kind: "numeric" },
    ...attributes.map((attr) => ({
      field: `Attribute: ${attr.name}`,
      value: attr.value,
      kind: attributeSlotKind(attr.inputType),
    })),
  ]);

  return {
    ...report,
    entity: "variant",
    id: variant.id,
    label: variant.name?.trim() || variant.sku?.trim() || `Variant ${variant.id}`,
  };
}

export function evaluateProductRecordCompleteness(product: ProductLike): EntityCompleteness {
  const attributes = attributesForCompleteness(product);
  const report = scoreSlots([
    { field: "Name", value: product.name, kind: "text" },
    { field: "Slug", value: product.slug, kind: "text" },
    { field: "External ID", value: product.external_id, kind: "text" },
    { field: "Status", value: product.status, kind: "text" },
    { field: "Category", value: namedValue(product.category), kind: "text" },
    { field: "Type", value: namedValue(product.product_type), kind: "text" },
    { field: "Description", value: product.description, kind: "description" },
    { field: "SEO title", value: product.seo_title, kind: "text" },
    { field: "SEO description", value: product.seo_description, kind: "description" },
    { field: "Images", value: product.images, kind: "image" },
    { field: "Length", value: dimensionValue(product.dimensions, "length"), kind: "numeric" },
    { field: "Width", value: dimensionValue(product.dimensions, "width"), kind: "numeric" },
    { field: "Height", value: dimensionValue(product.dimensions, "height"), kind: "numeric" },
    ...attributes.map((attr) => ({
      field: `Attribute: ${attr.name}`,
      value: attr.value,
      kind: attributeSlotKind(attr.inputType),
    })),
  ]);

  return {
    ...report,
    entity: "product",
    id: product.id,
    label: product.name?.trim() || `Product ${product.id}`,
  };
}

export function evaluateProductCompleteness(
  product: ProductLike,
  variants: VariantLike[] = []
): ProductCompleteness {
  const productReport = evaluateProductRecordCompleteness(product);
  const variantReports = variants.map((variant) =>
    evaluateVariantCompleteness(variant, product.payload, product.images)
  );
  const overall = mergeReports([productReport, ...variantReports]);
  return {
    ...overall,
    product: productReport,
    variants: variantReports,
  };
}

/**
 * Recompute completeness after an edit.
 * If variants are loaded, score product + those rows. Otherwise keep the previous
 * variant slice and only refresh the product fields.
 */
export function completenessForProductRow(
  product: ProductLike,
  loadedVariants?: VariantLike[] | null,
  previous?: ProductCompleteness
): ProductCompleteness {
  if (loadedVariants) {
    return evaluateProductCompleteness(product, loadedVariants);
  }
  const productReport = evaluateProductRecordCompleteness(product);
  const variantReports = previous?.variants ?? [];
  const overall = mergeReports([productReport, ...variantReports]);
  return {
    ...overall,
    product: productReport,
    variants: variantReports,
  };
}

export function completenessStatusLabel(status: CompletenessStatus): string {
  if (status === "complete") return "Complete";
  if (status === "needs_review") return "Needs review";
  return "Incomplete";
}

/** Map a completeness issue field to the Excel header used in bulk edit files. */
export function completenessIssueColumn(field: string): string {
  if (field.startsWith("Attribute: ")) return field.slice("Attribute: ".length);
  return field;
}

export type CompletenessFilter = {
  status?: CompletenessStatus | "";
  issues?: CompletenessIssueKind[];
};

export function hasCompletenessFilter(filter: CompletenessFilter | undefined): boolean {
  if (!filter) return false;
  return Boolean(filter.status) || Boolean(filter.issues?.length);
}

export function matchesCompletenessFilter(
  report: CompletenessReport,
  filter: CompletenessFilter | undefined
): boolean {
  if (!hasCompletenessFilter(filter)) return true;
  if (filter?.status && report.status !== filter.status) return false;
  if (filter?.issues?.length) {
    const counts: Record<CompletenessIssueKind, number> = {
      empty: report.empty_count,
      na: report.na_count,
      zero: report.zero_count,
      short: report.short_count,
    };
    return filter.issues.some((kind) => counts[kind] > 0);
  }
  return true;
}
