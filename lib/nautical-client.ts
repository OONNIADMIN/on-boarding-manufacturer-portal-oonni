/**
 * Server-side Nautical GraphQL (credentials from env only).
 */

export type NauticalConfig = {
  url: string;
  token: string;
};

export function getNauticalConfig(): NauticalConfig | null {
  const url = process.env.NAUTICAL_API_URL?.trim();
  const token = process.env.NAUTICAL_BEARER_TOKEN?.trim();
  if (!url) return null;
  if (!token) return null;
  return { url, token };
}

export function nauticalNotConfiguredMessage(): string {
  return "Nautical integration is not configured. Set NAUTICAL_API_URL and NAUTICAL_BEARER_TOKEN on the server.";
}

export async function nauticalGraphql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const cfg = getNauticalConfig();
  if (!cfg) {
    throw new Error(nauticalNotConfiguredMessage());
  }

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nautical HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  if (body.data == null) {
    throw new Error("Nautical returned no data");
  }
  return body.data;
}

const PRODUCT_TYPES_PAGE = `
query ($afterCursor: String) {
  productTypes(first: 100, after: $afterCursor) {
    pageInfo {
      endCursor
      hasNextPage
    }
    edges {
      node {
        id
        slug
        name
        metadata {
          key
          value
        }
        productAttributes {
          id
          slug
          name
          inputType
        }
        variantAttributes {
          id
          slug
          name
          inputType
        }
      }
    }
  }
}
`;

export type NauticalProductTypeNode = {
  id: string;
  slug: string;
  name: string;
  metadata?: Array<{ key: string; value: string }> | null;
  productAttributes: Array<{ id: string; slug: string; name: string; inputType: string }>;
  variantAttributes: Array<{ id: string; slug: string; name: string; inputType: string }>;
};

type ProductTypesConnection = {
  productTypes: {
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
    edges: Array<{ node: NauticalProductTypeNode }>;
  };
};

export async function fetchAllNauticalProductTypes(): Promise<NauticalProductTypeNode[]> {
  const nodes: NauticalProductTypeNode[] = [];
  let afterCursor: string | null = null;

  for (;;) {
    const data: ProductTypesConnection = await nauticalGraphql<ProductTypesConnection>(
      PRODUCT_TYPES_PAGE,
      { afterCursor }
    );

    const conn = data.productTypes;
    for (const e of conn.edges) {
      nodes.push(e.node);
    }
    if (!conn.pageInfo.hasNextPage) break;
    afterCursor = conn.pageInfo.endCursor;
    if (!afterCursor) break;
  }

  return nodes;
}

const PRODUCT_TYPE_BY_ID = `
query ($id: ID!) {
  productType(id: $id) {
    id
    slug
    name
    productAttributes {
      id
      name
    }
    variantAttributes {
      id
      name
    }
  }
}
`;

export async function fetchNauticalProductTypeById(
  id: string
): Promise<NauticalProductTypeNode | null> {
  try {
    const data = await nauticalGraphql<{
      productType: NauticalProductTypeNode | null;
    }>(PRODUCT_TYPE_BY_ID, { id });
    if (data.productType) return data.productType;
  } catch {
    /* Some Nautical deployments omit `productType(id)`; fall back to list. */
  }
  const all = await fetchAllNauticalProductTypes();
  return all.find((n) => n.id === id) ?? null;
}

/** Category node from Nautical (nested children). */
export type NauticalCategoryNode = {
  name: string;
  slug: string;
  children?: { edges: { node: NauticalCategoryNode }[] } | null;
};

const CATEGORIES_FOR_TEMPLATE = `
query ($search: String!) {
  categories(first: 100, filter: { search: $search }) {
    edges {
      node {
        name
        slug
        children(first: 100) {
          edges {
            node {
              name
              slug
              children(first: 100) {
                edges {
                  node {
                    name
                    slug
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

export function flattenNauticalCategoryTree(roots: NauticalCategoryNode[]): Array<{
  path: string;
  slug: string;
  level: number;
}> {
  const out: Array<{ path: string; slug: string; level: number }> = [];
  const visit = (n: NauticalCategoryNode, prefix: string[]) => {
    const names = [...prefix, n.name];
    const path = names.join(" > ");
    out.push({ path, slug: n.slug, level: names.length });
    const kids = n.children?.edges?.map((e) => e.node) ?? [];
    for (const k of kids) visit(k, names);
  };
  for (const r of roots) visit(r, []);
  out.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
  return out;
}

/**
 * Categories whose root search matches the product template name (same as Excel filter).
 * Used to build the category tree sheet + dropdown on the Catalog sheet.
 */
export async function fetchCategoriesForTemplateSearch(
  searchName: string
): Promise<Array<{ path: string; slug: string; level: number }>> {
  const q = searchName.trim();
  if (!q) return [];
  try {
    const data = await nauticalGraphql<{
      categories: { edges: { node: NauticalCategoryNode }[] };
    }>(CATEGORIES_FOR_TEMPLATE, { search: q });
    const roots = data.categories.edges.map((e) => e.node);
    return flattenNauticalCategoryTree(roots);
  } catch (e) {
    console.warn("nautical categories (template search):", e);
    return [];
  }
}
