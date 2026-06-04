/** Normalize Excel/CSV header for comparison (trim, lowercase, collapse spaces). */
export function normalizeCatalogHeader(s: string): string {
  return s.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export type CatalogColumnRuleRecord = {
  id: number;
  label: string;
  candidates: string[];
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

function findColumn(columnNames: string[], candidates: string[]): string | null {
  const trimmed = columnNames.map((c) => String(c ?? "").trim()).filter(Boolean);
  const byNorm = new Map(trimmed.map((c) => [normalizeCatalogHeader(c), c]));
  for (const cand of candidates) {
    const hit = byNorm.get(normalizeCatalogHeader(cand));
    if (hit) return hit;
  }
  return null;
}

/** Match a spreadsheet header against configured candidate names (exported for reuse). */
export function findCatalogColumn(columnNames: string[], candidates: string[]): string | null {
  return findColumn(columnNames, candidates);
}

/** Resolve the actual header for an active column rule by its label (e.g. "sku", "images"). */
export function resolveCatalogColumnForRule(
  columnNames: string[],
  rules: CatalogColumnRuleRecord[],
  ruleLabel: string
): string | null {
  const labelNorm = ruleLabel.trim().toLowerCase();
  const rule = rules.find((r) => r.is_active && r.label.trim().toLowerCase() === labelNorm);
  if (!rule) return null;
  return findColumn(columnNames, rule.candidates);
}

/** Map each active rule label (lowercase) to the matched spreadsheet header, when found. */
export function buildCatalogColumnMappings(
  columnNames: string[],
  rules: CatalogColumnRuleRecord[]
): Record<string, string> {
  const mappings: Record<string, string> = {};
  for (const rule of rules.filter((r) => r.is_active)) {
    const matched = findColumn(columnNames, rule.candidates);
    if (matched) mappings[rule.label.trim().toLowerCase()] = matched;
  }
  return mappings;
}

export type CatalogColumnValidationResult = {
  valid: boolean;
  missing: string[];
  message: string;
};

export type CatalogColumnCheck = {
  label: string;
  satisfied: boolean;
  matchedColumn?: string;
};

export function getCatalogColumnChecks(
  columnNames: string[],
  rules: CatalogColumnRuleRecord[]
): CatalogColumnCheck[] {
  const columns = columnNames.map((c) => String(c ?? "").trim()).filter(Boolean);
  const activeRules = rules.filter((rule) => rule.is_active);

  return activeRules.map((rule) => {
    const matchedColumn = findColumn(columns, rule.candidates);
    return {
      label: rule.label,
      satisfied: Boolean(matchedColumn),
      matchedColumn: matchedColumn ?? undefined,
    };
  });
}

export function validateCatalogColumns(
  columnNames: string[],
  rules: CatalogColumnRuleRecord[]
): CatalogColumnValidationResult {
  const columns = columnNames.map((c) => String(c ?? "").trim()).filter(Boolean);
  const activeRules = rules.filter((rule) => rule.is_active);

  if (!columns.length) {
    return {
      valid: false,
      missing: ["header row"],
      message:
        "Could not read column headers. Use the catalog template and include a header row with  column names.",
    };
  }

  if (!activeRules.length) {
    return {
      valid: false,
      missing: ["column rules"],
      message: "No active catalog column rules are configured. Contact your administrator.",
    };
  }

  const missing = activeRules
    .filter((rule) => !findColumn(columns, rule.candidates))
    .map((rule) => rule.label);

  if (!missing.length) {
    return { valid: true, missing: [], message: "" };
  }

  const requiredLabels = activeRules.map((rule) => rule.label).join(", ");

  return {
    valid: false,
    missing,
    message: `The file is missing required columns: ${missing.join(", ")}. Expected headers include: ${requiredLabels}.`,
  };
}
