import columnNautical from "@/data_json/column_nautical.json";

export type NauticalTargetColumn = {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
};

function normalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Priority columns from bundled JSON (Oonni / import pipeline), ordered for Excel. */
export function getPriorityColumnDefinitions(): NauticalTargetColumn[] {
  const raw = columnNautical as { target_columns?: NauticalTargetColumn[] };
  return Array.isArray(raw.target_columns) ? raw.target_columns : [];
}

/**
 * First: JSON priority columns (active only, sorted by sort_order).
 * Then: Nautical product + variant attribute names, skipping names already present (case-insensitive).
 */
export function buildMergedTemplateHeaders(
  priority: NauticalTargetColumn[],
  productAttributes: Array<{ name: string }>,
  variantAttributes: Array<{ name: string }>
): string[] {
  const active = priority.filter(
    (c) => c?.name && String(c.name).trim() && c.is_active !== false
  );
  active.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const priorityNames = active.map((c) => String(c.name).trim());

  const seen = new Set(priorityNames.map(normalizeHeaderKey));
  const tail: string[] = [];

  const pushUnique = (names: string[]) => {
    for (const rawName of names) {
      const n = rawName?.trim();
      if (!n) continue;
      const k = normalizeHeaderKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      tail.push(n);
    }
  };

  pushUnique(productAttributes.map((a) => a.name));
  pushUnique(variantAttributes.map((a) => a.name));

  return [...priorityNames, ...tail];
}

export function safeTemplateFilename(slug: string): string {
  const s = slug.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "template";
  return `catalog-template-${s}.xlsx`;
}
