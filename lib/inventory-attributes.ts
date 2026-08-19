/**
 * Inventory attribute JSON stored on products/variants.
 *
 * Canonical row (what we persist):
 *   { id, name, slug, inputType, value, values }
 * - id / inputType / slug come from Traide (AssignedAttribute.attribute)
 * - value is the display/Excel scalar
 * - values keeps the original assigned options when present
 *
 * GraphQL mutation input is built separately (AttributeValueInput) from this JSON.
 */

export type InventoryAttributeValue = {
  slug?: string | null;
  name?: string | null;
  value?: string | null;
};

export type MappedInventoryAttribute = {
  id: string | null;
  name: string;
  slug: string | null;
  inputType: string | null;
  value: string;
  values?: InventoryAttributeValue[];
};

const DROPDOWN_INPUT_TYPES = new Set(["DROPDOWN", "SWATCH"]);

const PLACEHOLDER_VALUE_NAMES = new Set([
  "plaintext",
  "plain_text",
  "plain text",
  "numeric",
  "boolean",
  "richtext",
  "rich text",
  "rich_text",
  "file",
  "date",
  "datetime",
  "date_time",
  "swatch",
  "reference",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function inputTypeOf(row: Record<string, unknown>): string | null {
  const attr = asRecord(row.attribute);
  const raw = asText(row.inputType ?? row.input_type ?? attr?.inputType ?? attr?.input_type);
  return raw ? raw.toUpperCase().replace(/[\s-]+/g, "_") : null;
}

function attributeNameOf(row: Record<string, unknown>): string {
  const attr = asRecord(row.attribute);
  return asText(attr?.name ?? row.name);
}

function attributeSlugOf(row: Record<string, unknown>): string | null {
  const attr = asRecord(row.attribute);
  const slug = asText(attr?.slug ?? row.slug);
  return slug || null;
}

function attributeIdOf(row: Record<string, unknown>): string | null {
  const attr = asRecord(row.attribute);
  const id = asText(attr?.id ?? row.id);
  return id || null;
}

function assignedValueRows(values: unknown): InventoryAttributeValue[] {
  if (!Array.isArray(values)) return [];
  const rows: InventoryAttributeValue[] = [];
  for (const item of values) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const text = String(item).trim();
      if (text) rows.push({ slug: null, name: text, value: text });
      continue;
    }
    const row = asRecord(item);
    if (!row) continue;
    rows.push({
      slug: asText(row.slug) || null,
      name: asText(row.name) || null,
      value: asText(row.value ?? row.plainText ?? row.plain_text) || null,
    });
  }
  return rows;
}

function firstValueRow(values: unknown): Record<string, unknown> | null {
  const rows = assignedValueRows(values);
  const first = rows[0];
  return first ? (first as Record<string, unknown>) : null;
}

function isPlaceholderValueName(name: string): boolean {
  return PLACEHOLDER_VALUE_NAMES.has(name.trim().toLowerCase());
}

export function assignedAttributeDisplayValue(
  values: unknown,
  inputType?: string | null
): string {
  const first = firstValueRow(values);
  if (!first) return "";
  const name = asText(first.name);
  const value = asText(first.value ?? first.plainText ?? first.plain_text);
  const type = (inputType ?? "").trim().toUpperCase();

  if (DROPDOWN_INPUT_TYPES.has(type) || type === "MULTISELECT") return name || value;
  if (!type) {
    if (isPlaceholderValueName(name)) return value;
    return name || value;
  }
  return value || name;
}

function scalarFromGraphqlKeys(row: Record<string, unknown>): string {
  if (row.plainText != null) return asText(row.plainText);
  if (row.amount != null) return asText(row.amount);
  if (typeof row.boolean === "boolean") return row.boolean ? "true" : "false";
  if (row.richText != null) return asText(row.richText);
  return asText(row.value);
}

export function mapInventoryAttributes(list: unknown): MappedInventoryAttribute[] {
  if (!Array.isArray(list)) return [];
  const mapped: MappedInventoryAttribute[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const name = attributeNameOf(row);
    if (!name) continue;
    const attr = asRecord(row.attribute);
    const inputType = inputTypeOf(row);
    const id = attributeIdOf(row);
    const slug = attributeSlugOf(row);
    const assigned = Array.isArray(row.values)
      ? row.values
      : Array.isArray(attr?.values)
        ? attr.values
        : [];
    let value = assignedValueRows(assigned).length
      ? assignedAttributeDisplayValue(assigned, inputType)
      : scalarFromGraphqlKeys(row);
    if (isPlaceholderValueName(value)) value = "";
    mapped.push({
      id,
      name,
      slug,
      inputType,
      value,
      values: assignedValueRows(assigned),
    });
  }
  return mapped;
}

export function persistInventoryAttributes(list: unknown): MappedInventoryAttribute[] {
  return mapInventoryAttributes(list).map((attr) => ({
    id: attr.id,
    name: attr.name,
    slug: attr.slug,
    inputType: attr.inputType,
    value: attr.value,
    values: attr.values?.length ? attr.values : attr.value ? [{ name: attr.value, value: attr.value }] : [],
  }));
}

export function mergeInventoryAttributes(
  existing: unknown,
  next: Array<{ name: string; value: string; id?: string | null; inputType?: string | null; slug?: string | null }>
): MappedInventoryAttribute[] {
  const current = persistInventoryAttributes(existing);
  const byName = new Map(current.map((attr) => [attr.name.toLowerCase(), attr]));
  const byId = new Map(current.filter((attr) => attr.id).map((attr) => [attr.id as string, attr]));
  const out: MappedInventoryAttribute[] = [];
  const seen = new Set<string>();

  for (const row of next) {
    const name = row.name.trim();
    if (!name) continue;
    const prev = (row.id ? byId.get(row.id) : undefined) ?? byName.get(name.toLowerCase());
    const value = row.value ?? prev?.value ?? "";
    const merged: MappedInventoryAttribute = {
      id: row.id ?? prev?.id ?? null,
      name: prev?.name ?? name,
      slug: row.slug ?? prev?.slug ?? null,
      inputType: row.inputType ?? prev?.inputType ?? null,
      value,
      values: value ? [{ name: value, value }] : [],
    };
    out.push(merged);
    seen.add(merged.name.toLowerCase());
  }

  for (const attr of current) {
    if (!seen.has(attr.name.toLowerCase())) out.push(attr);
  }
  return out;
}

export function resolveInventoryAttributes(source: {
  attributes?: unknown;
  payload?: unknown;
}): MappedInventoryAttribute[] {
  const stored = persistInventoryAttributes(source.attributes);
  const payload = asRecord(source.payload);
  const fromPayload = persistInventoryAttributes(payload?.attributes);
  if (!fromPayload.length) return stored;
  if (!stored.length) return fromPayload;

  const payloadByName = new Map(fromPayload.map((attr) => [attr.name.toLowerCase(), attr]));
  return stored.map((attr) => {
    const fallback = payloadByName.get(attr.name.toLowerCase());
    if (!fallback) return attr;
    const value =
      attr.value && !isPlaceholderValueName(attr.value) ? attr.value : fallback.value;
    return {
      id: attr.id || fallback.id,
      name: attr.name,
      slug: attr.slug || fallback.slug,
      inputType: attr.inputType || fallback.inputType,
      value,
      values: attr.values?.length ? attr.values : fallback.values,
    };
  });
}
