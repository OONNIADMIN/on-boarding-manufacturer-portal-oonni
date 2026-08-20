import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type StoredCategoryRow = {
  id: number;
  nautical_id: string;
  parent_id: number | null;
  name: string;
  slug: string;
};

export type InventoryCategoryOption = {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  parent_id: string | null;
};

export function flattenStoredCategoryTree(rows: StoredCategoryRow[]): InventoryCategoryOption[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<number | null, StoredCategoryRow[]>();
  for (const row of rows) {
    const parentExists = row.parent_id != null && byId.has(row.parent_id);
    const key = parentExists ? row.parent_id : null;
    const list = children.get(key) ?? [];
    list.push(row);
    children.set(key, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  const out: InventoryCategoryOption[] = [];
  const visit = (row: StoredCategoryRow, prefix: string[], parentNauticalId: string | null) => {
    const pathParts = [...prefix, row.name];
    out.push({
      id: row.nautical_id,
      name: row.name,
      slug: row.slug,
      path: pathParts.join(" > "),
      level: pathParts.length,
      parent_id: parentNauticalId,
    });
    for (const child of children.get(row.id) ?? []) {
      visit(child, pathParts, row.nautical_id);
    }
  };
  for (const root of children.get(null) ?? []) visit(root, [], null);
  return out;
}

export function categoryJsonFromOption(option: {
  id: string;
  slug: string;
  name: string;
}): Prisma.InputJsonValue {
  return { id: option.id, slug: option.slug, name: option.name };
}

export function matchCategoryOption(
  options: InventoryCategoryOption[],
  value: string
): InventoryCategoryOption | null {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  const byPath = options.find((row) => row.path.toLowerCase() === needle || row.id.toLowerCase() === needle);
  if (byPath) return byPath;
  const bySlug = options.find((row) => row.slug.toLowerCase() === needle);
  if (bySlug) return bySlug;
  const byName = options.filter((row) => row.name.toLowerCase() === needle);
  return byName.length === 1 ? byName[0] : null;
}

function cloneCategoryJson(existing: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (existing == null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(existing)) as Prisma.InputJsonValue;
}

export async function resolveCategoryJson(input: {
  categoryId?: string | null;
  categoryName?: string | null;
  existing?: unknown;
}): Promise<Prisma.InputJsonValue | typeof Prisma.JsonNull> {
  const categoryId = input.categoryId?.trim() || null;
  const existingId =
    input.existing && typeof input.existing === "object"
      ? String((input.existing as { id?: unknown }).id ?? "").trim() || null
      : null;
  const existingName =
    input.existing && typeof input.existing === "object"
      ? String((input.existing as { name?: unknown }).name ?? "").trim() || null
      : null;

  if (categoryId) {
    const row = await prisma.traideCategory.findFirst({
      where: { nautical_id: categoryId, deleted_at: null },
      select: { nautical_id: true, slug: true, name: true },
    });
    if (row) return categoryJsonFromOption({ id: row.nautical_id, slug: row.slug, name: row.name });
    if (existingId === categoryId) return cloneCategoryJson(input.existing);
  }

  const name = input.categoryName?.trim() || null;
  if (name) {
    const rows = await prisma.traideCategory.findMany({
      where: { deleted_at: null },
      select: { id: true, nautical_id: true, parent_id: true, name: true, slug: true },
    });
    const options = flattenStoredCategoryTree(rows);
    const picked = matchCategoryOption(options, name);
    if (picked) return categoryJsonFromOption(picked);
    if (existingName && existingName.toLowerCase() === name.toLowerCase()) {
      return cloneCategoryJson(input.existing);
    }
    const prev = input.existing && typeof input.existing === "object" ? (input.existing as Record<string, unknown>) : null;
    return { ...(prev ?? {}), name };
  }

  return cloneCategoryJson(input.existing);
}

export type CategoryLookup = { id: string; slug: string; name: string };

export async function loadCategoryLookup(): Promise<CategoryLookup[]> {
  const rows = await prisma.traideCategory.findMany({
    where: { deleted_at: null },
    select: { nautical_id: true, slug: true, name: true },
  });
  return rows.map((row) => ({ id: row.nautical_id, slug: row.slug, name: row.name }));
}
