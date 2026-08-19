/**
 * Nautical selected-attribute values:
 * - DROPDOWN: the chosen option label is `values[].name`
 * - PLAIN_TEXT and other types: the stored content is `values[].value`
 *   (`name` is a placeholder like "plaintext")
 */

export type MappedInventoryAttribute = {
  name: string;
  value: string;
  inputType?: string | null;
  id?: string | null;
};

const DROPDOWN_INPUT_TYPES = new Set(["DROPDOWN"]);

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
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function inputTypeOf(row: Record<string, unknown>): string {
  const attr = asRecord(row.attribute);
  return String(row.inputType ?? row.input_type ?? attr?.inputType ?? attr?.input_type ?? "")
    .trim()
    .toUpperCase();
}

function attributeNameOf(row: Record<string, unknown>): string {
  const attr = asRecord(row.attribute);
  return String(attr?.name ?? row.name ?? "").trim();
}

function firstValueRow(values: unknown): Record<string, unknown> | null {
  if (!Array.isArray(values)) return null;
  const first = values.find((item) => item && typeof item === "object");
  return asRecord(first);
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
  const name = String(first.name ?? "").trim();
  const value = String(first.value ?? first.plainText ?? first.plain_text ?? "").trim();
  const type = (inputType ?? "").trim().toUpperCase();

  if (DROPDOWN_INPUT_TYPES.has(type)) return name || value;
  if (!type) {
    if (isPlaceholderValueName(name)) return value;
    return name || value;
  }
  return value;
}

export function mapInventoryAttributes(list: unknown): MappedInventoryAttribute[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const name = attributeNameOf(row);
      if (!name) return null;
      const attr = asRecord(row.attribute);
      const inputType = inputTypeOf(row) || null;
      const id = attr?.id != null ? String(attr.id) : row.id != null ? String(row.id) : null;
      const assigned = Array.isArray(row.values)
        ? row.values
        : Array.isArray(attr?.values)
          ? attr.values
          : [];
      let value = assigned.length
        ? assignedAttributeDisplayValue(assigned, inputType)
        : String(row.value ?? "").trim();
      if (isPlaceholderValueName(value)) value = "";
      return { name, value, inputType, id };
    })
    .filter((row): row is MappedInventoryAttribute => Boolean(row));
}

export function resolveInventoryAttributes(source: {
  attributes?: unknown;
  payload?: unknown;
}): MappedInventoryAttribute[] {
  const stored = mapInventoryAttributes(source.attributes);
  const payload = asRecord(source.payload);
  const fromPayload = mapInventoryAttributes(payload?.attributes);
  if (!fromPayload.length) return stored;
  if (!stored.length) return fromPayload;

  const payloadByName = new Map(fromPayload.map((attr) => [attr.name.toLowerCase(), attr]));
  return stored.map((attr) => {
    if (attr.value && !isPlaceholderValueName(attr.value)) return attr;
    return payloadByName.get(attr.name.toLowerCase()) ?? attr;
  });
}
