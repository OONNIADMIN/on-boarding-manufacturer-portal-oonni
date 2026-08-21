import { executeTraideQuery } from "@/lib/traide/graphql/client";

export type NauticalMetadataEntry = { key?: string | null; value?: string | null };

export type NauticalCategoryParent = {
  id?: string | null;
  slug?: string | null;
  metadata?: NauticalMetadataEntry[] | null;
};

export type NauticalCategoryNode = {
  id?: string | null;
  name: string;
  slug: string;
  parent?: NauticalCategoryParent | null;
  metadata?: NauticalMetadataEntry[] | null;
  customFields?: {
    values?: Array<{
      attribute?: { name?: string | null } | null;
      plainText?: string | null;
    } | null> | null;
  } | null;
  children?: { edges: { node: NauticalCategoryNode }[] } | null;
};

export type NauticalCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  parent_slug: string | null;
  metadata: NauticalMetadataEntry[];
  custom_fields: unknown;
  payload: NauticalCategoryNode;
};

type CategoriesConnection = {
  categories: {
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
    edges: Array<{ node: NauticalCategoryNode }>;
  };
};

export function flattenNauticalCategoryTree(roots: NauticalCategoryNode[]): Array<{
  path: string;
  slug: string;
  level: number;
}> {
  const out: Array<{ path: string; slug: string; level: number }> = [];
  const visit = (node: NauticalCategoryNode, prefix: string[]) => {
    const names = [...prefix, node.name];
    out.push({ path: names.join(" > "), slug: node.slug, level: names.length });
    const kids = node.children?.edges?.map((edge) => edge.node) ?? [];
    for (const child of kids) visit(child, names);
  };
  for (const root of roots) visit(root, []);
  out.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
  return out;
}

export async function fetchCategoriesForTemplateSearch(
  searchName: string
): Promise<Array<{ path: string; slug: string; level: number }>> {
  const q = searchName.trim();
  if (!q) return [];
  try {
    const data = await executeTraideQuery<{
      categories: { edges: { node: NauticalCategoryNode }[] };
    }>("categoriesForTemplate", { search: q });
    return flattenNauticalCategoryTree(data.categories.edges.map((edge) => edge.node));
  } catch (e) {
    console.warn("nautical categories (template search):", e);
    return [];
  }
}

export async function fetchAllNauticalCategories(): Promise<NauticalCategoryRecord[]> {
  const records: NauticalCategoryRecord[] = [];
  let afterCursor: string | null = null;

  for (;;) {
    const data: CategoriesConnection = await executeTraideQuery<CategoriesConnection>(
      "allCategories",
      { afterCursor }
    );
    const conn: CategoriesConnection["categories"] = data.categories;
    for (const edge of conn.edges) {
      const node = edge.node;
      const id = String(node.id ?? "").trim();
      if (!id) continue;
      records.push({
        id,
        name: String(node.name ?? "").trim(),
        slug: String(node.slug ?? "").trim(),
        parent_id: node.parent?.id ? String(node.parent.id).trim() : null,
        parent_slug: node.parent?.slug ? String(node.parent.slug).trim() : null,
        metadata: Array.isArray(node.metadata) ? node.metadata : [],
        custom_fields: node.customFields ?? null,
        payload: node,
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    afterCursor = conn.pageInfo.endCursor;
    if (!afterCursor) break;
  }

  return records;
}
