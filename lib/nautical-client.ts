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
