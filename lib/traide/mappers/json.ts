export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function asOptionalText(value: unknown): string | null {
  const text = asText(value);
  return text ? text : null;
}

export function namedField(value: unknown, key: "id" | "slug" | "name"): string | null {
  const rec = asRecord(value);
  return asOptionalText(rec?.[key]);
}

export function decimalString(value: unknown, fallback = "0"): string {
  if (value == null || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return String(num);
}
