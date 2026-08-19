import { executeTraideQuery } from "@/lib/traide/graphql/client";

export type NauticalCategoryNode = {
  name: string;
  slug: string;
  children?: { edges: { node: NauticalCategoryNode }[] } | null;
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
