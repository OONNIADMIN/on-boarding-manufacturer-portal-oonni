import { prisma } from "@/lib/db";
import { DEFAULT_CATALOG_COLUMN_RULES } from "@/lib/catalog-column-rules-defaults";
import type { CatalogColumnRuleRecord } from "@/lib/catalog-column-validation";

function mapRule(row: {
  id: number;
  label: string;
  candidates: unknown;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): CatalogColumnRuleRecord {
  const candidates = Array.isArray(row.candidates)
    ? row.candidates.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  return {
    id: row.id,
    label: row.label,
    candidates,
    sort_order: row.sort_order,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** In-memory defaults when DB is unavailable or not migrated yet. */
export function getDefaultCatalogColumnRules(): CatalogColumnRuleRecord[] {
  return DEFAULT_CATALOG_COLUMN_RULES.map((rule, index) => ({
    id: -(index + 1),
    label: rule.label,
    candidates: [...rule.candidates],
    sort_order: rule.sort_order,
    is_active: rule.is_active,
  }));
}

function isMissingCatalogRulesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "P2021" || code === "P2022";
}

async function queryCatalogColumnRules(activeOnly: boolean) {
  const delegate = prisma.catalogColumnRule;
  if (!delegate?.findMany) {
    throw new TypeError("Prisma client is missing catalogColumnRule. Run: npx prisma generate");
  }

  return delegate.findMany({
    where: activeOnly ? { is_active: true } : undefined,
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
  });
}

export async function seedDefaultCatalogColumnRules(): Promise<void> {
  const delegate = prisma.catalogColumnRule;
  if (!delegate?.deleteMany || !delegate?.createMany) {
    throw new TypeError("Prisma client is missing catalogColumnRule. Run: npx prisma generate");
  }

  await delegate.deleteMany();
  await delegate.createMany({
    data: DEFAULT_CATALOG_COLUMN_RULES.map((rule) => ({
      label: rule.label,
      candidates: rule.candidates,
      sort_order: rule.sort_order,
      is_active: rule.is_active,
    })),
  });
}

export async function listCatalogColumnRules(options?: {
  activeOnly?: boolean;
}): Promise<CatalogColumnRuleRecord[]> {
  const activeOnly = options?.activeOnly ?? false;

  try {
    let rows = await queryCatalogColumnRules(activeOnly);

    if (!rows.length) {
      await seedDefaultCatalogColumnRules();
      rows = await queryCatalogColumnRules(activeOnly);
    }

    return rows.map(mapRule);
  } catch (error) {
    console.warn("Catalog column rules DB read failed, using defaults:", error);
    const defaults = getDefaultCatalogColumnRules();
    return activeOnly ? defaults.filter((rule) => rule.is_active) : defaults;
  }
}

export async function getActiveCatalogColumnRules(): Promise<CatalogColumnRuleRecord[]> {
  return listCatalogColumnRules({ activeOnly: true });
}

export type CatalogColumnRuleInput = {
  id?: number;
  label: string;
  candidates: string[];
  sort_order: number;
  is_active: boolean;
};

export async function replaceCatalogColumnRules(
  rules: CatalogColumnRuleInput[]
): Promise<CatalogColumnRuleRecord[]> {
  const sanitized = rules.map((rule, index) => ({
    label: rule.label.trim(),
    candidates: rule.candidates.map((c) => c.trim()).filter(Boolean),
    sort_order: rule.sort_order ?? index,
    is_active: rule.is_active ?? true,
  }));

  for (const rule of sanitized) {
    if (!rule.label) throw new Error("Each rule must have a label");
    if (!rule.candidates.length) throw new Error(`Rule "${rule.label}" needs at least one column name`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.catalogColumnRule.deleteMany();
      await tx.catalogColumnRule.createMany({
        data: sanitized,
      });
    });
  } catch (error) {
    if (isMissingCatalogRulesTableError(error)) {
      throw new Error("Catalog column rules table is missing. Run: npx prisma migrate deploy");
    }
    throw error;
  }

  return listCatalogColumnRules();
}
