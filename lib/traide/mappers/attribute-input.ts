/**
 * Coerce stored inventory attributes into Traide AttributeValueInput,
 * matching oonni-integration-middleware `build_attribute_graphql_payload`.
 *
 * Mutation payload keys by inputType:
 *   DROPDOWN / SWATCH / MULTISELECT → { id, values: string[] }
 *   BOOLEAN                         → { id, boolean }
 *   NUMERIC / METRIC / MONEY        → { id, amount } (+ unit / currency)
 *   RICH_TEXT                       → { id, richText }
 *   PLAIN_TEXT (default)            → { id, plainText }
 */

import type { MappedInventoryAttribute } from "@/lib/inventory-attributes";
import { resolveInventoryAttributes } from "@/lib/inventory-attributes";
import { asOptionalText, asRecord, asText } from "./json";

export type TraideAttributeInput = {
  id: string;
  values?: string[];
  plainText?: string;
  boolean?: boolean;
  amount?: string | number;
  richText?: string;
  unit?: string;
  currency?: string;
};

export type TraideAttributeCatalogItem = {
  id: string;
  name: string;
  slug?: string | null;
  inputType?: string | null;
  valueRequired?: boolean | null;
};

const CANONICAL_TYPES = new Set([
  "DROPDOWN",
  "SWATCH",
  "MULTISELECT",
  "NUMERIC",
  "PLAIN_TEXT",
  "RICH_TEXT",
  "BOOLEAN",
  "MONEY",
  "METRIC",
  "DATETIME",
  "FILE",
  "REFERENCE",
]);

const TYPE_ALIASES: Record<string, string> = {
  pim_catalog_boolean: "BOOLEAN",
  pim_catalog_simpleselect: "DROPDOWN",
  pim_catalog_simpleselect_date: "DATETIME",
  pim_catalog_file: "FILE",
  pim_catalog_price: "MONEY",
  pim_catalog_multiselect: "MULTISELECT",
  pim_catalog_number: "NUMERIC",
  pim_catalog_text: "PLAIN_TEXT",
  pim_catalog_textarea: "RICH_TEXT",
  pim_catalog_metric: "METRIC",
};

const UNIT_ALIASES: Record<string, string> = {
  lb: "pound",
  lbs: "pound",
  pound: "pound",
  pounds: "pound",
  in: "inch",
  inch: "inch",
  inches: "inch",
  cm: "centimeter",
  millimeter: "millimeter",
  mm: "millimeter",
  m: "meter",
  meter: "meter",
  oz: "ounce",
  ounce: "ounce",
  kg: "kilogram",
  kilogram: "kilogram",
  g: "gram",
  gram: "gram",
};

function normalizeInputType(value: unknown): string {
  const raw = asText(value);
  if (!raw) return "";
  const aliased = TYPE_ALIASES[raw] || TYPE_ALIASES[raw.toLowerCase()];
  if (aliased) return aliased;
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (CANONICAL_TYPES.has(upper)) return upper;
  return upper;
}

function parseBoolean(value: string): boolean {
  const key = value.trim().toLowerCase();
  if (!key) return false;
  return !["false", "0", "no", "n", "off", "f", "0.0"].includes(key);
}

function formatAmount(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d+\.?\d*)/);
  const cleaned = match ? match[1] : text.replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return "0";
  if (Number.isInteger(num)) return String(Math.trunc(num));
  return String(num);
}

function metricUnitFromSlug(slug: string | null | undefined): string | undefined {
  const match = String(slug ?? "").match(/\(([^)]+)\)/);
  if (!match?.[1]) return undefined;
  const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
  return UNIT_ALIASES[key];
}

function lookupCatalogItem(
  attr: MappedInventoryAttribute,
  catalog: TraideAttributeCatalogItem[]
): TraideAttributeCatalogItem | undefined {
  const existing = asOptionalText(attr.id);
  if (existing) {
    const byId = catalog.find((item) => item.id === existing);
    if (byId) return byId;
  }
  const needle = attr.name.trim().toLowerCase();
  const slugNeedle = asText(attr.slug).toLowerCase();
  return catalog.find((item) => {
    const name = asText(item.name).toLowerCase();
    const slug = asText(item.slug).toLowerCase();
    return name === needle || (slugNeedle && slug === slugNeedle) || slug === needle;
  });
}

function selectValues(value: string, multiselect: boolean): string[] {
  if (!value.trim()) return ["N/A"];
  if (!multiselect) return [value.trim()];
  const parts = value.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : ["N/A"];
}

export function toTraideAttributeInput(
  attr: MappedInventoryAttribute,
  catalog: TraideAttributeCatalogItem[] = []
): TraideAttributeInput | null {
  const catalogItem = lookupCatalogItem(attr, catalog);
  const id = asOptionalText(attr.id) || catalogItem?.id || null;
  if (!id) return null;
  const inputType = normalizeInputType(attr.inputType || catalogItem?.inputType) || "PLAIN_TEXT";
  const value = attr.value ?? "";

  if (inputType === "DROPDOWN" || inputType === "SWATCH") {
    return { id, values: selectValues(value, false) };
  }
  if (inputType === "MULTISELECT") {
    return { id, values: selectValues(value, true) };
  }
  if (inputType === "BOOLEAN") {
    return { id, boolean: parseBoolean(value) };
  }
  if (inputType === "NUMERIC" || inputType === "METRIC" || inputType === "MONEY") {
    const payload: TraideAttributeInput = { id, amount: formatAmount(value) };
    if (inputType === "MONEY") payload.currency = "USD";
    if (inputType === "METRIC") {
      const unit = metricUnitFromSlug(catalogItem?.slug || attr.slug);
      if (unit) payload.unit = unit;
    }
    return payload;
  }
  if (inputType === "RICH_TEXT") {
    const trimmed = value.trim();
    const html = !trimmed ? "<p></p>" : trimmed.startsWith("<") ? trimmed : `<p>${trimmed}</p>`;
    return { id, richText: html };
  }
  return { id, plainText: value };
}

export function attributesFromInventorySource(
  source: { attributes?: unknown; payload?: unknown },
  catalog: TraideAttributeCatalogItem[] = []
): TraideAttributeInput[] {
  const stored = resolveInventoryAttributes(source);
  const payloadAttrs = resolveInventoryAttributes({
    attributes: asRecord(source.payload)?.attributes,
  });
  const byName = new Map(
    [...payloadAttrs, ...stored].map((attr) => [attr.name.toLowerCase(), attr])
  );
  const byId = new Map(
    [...payloadAttrs, ...stored].filter((attr) => attr.id).map((attr) => [attr.id as string, attr])
  );

  const rows: MappedInventoryAttribute[] = [];
  if (catalog.length) {
    for (const item of catalog) {
      const match =
        byId.get(item.id) ||
        byName.get(asText(item.name).toLowerCase()) ||
        byName.get(asText(item.slug).toLowerCase());
      rows.push({
        id: item.id,
        name: item.name,
        slug: item.slug ?? match?.slug ?? null,
        inputType: item.inputType ?? match?.inputType ?? null,
        value: match?.value ?? "",
        valueRequired: Boolean(item.valueRequired || match?.valueRequired),
        values: match?.values,
      });
    }
    for (const attr of stored) {
      if (attr.id && !rows.some((row) => row.id === attr.id)) rows.push(attr);
    }
  } else {
    rows.push(...stored);
  }

  return rows
    .map((attr) => toTraideAttributeInput(attr, catalog))
    .filter((attr): attr is TraideAttributeInput => Boolean(attr));
}

/** Nautical productVariantUpdate persists NUMERIC only with float amounts. */
export function attributesForVariantUpdate(attributes: TraideAttributeInput[]): TraideAttributeInput[] {
  return attributes.map((attr) => {
    if (attr.amount == null || attr.amount === "") return attr;
    const num = Number(attr.amount);
    return { ...attr, amount: Number.isFinite(num) ? num : 0 };
  });
}
