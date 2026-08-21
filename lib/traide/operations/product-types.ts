import { executeTraideQuery } from "@/lib/traide/graphql/client";

export type NauticalProductTypeNode = {
  id: string;
  slug: string;
  name: string;
  metadata?: Array<{ key: string; value: string }> | null;
  productAttributes: Array<{
    id: string;
    slug?: string;
    name: string;
    inputType?: string | null;
    valueRequired?: boolean | null;
  }>;
  variantAttributes: Array<{
    id: string;
    slug?: string;
    name: string;
    inputType?: string | null;
    valueRequired?: boolean | null;
  }>;
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
    const data: ProductTypesConnection = await executeTraideQuery<ProductTypesConnection>(
      "productTypesPage",
      { afterCursor }
    );
    const conn = data.productTypes;
    for (const edge of conn.edges) {
      nodes.push(edge.node);
    }
    if (!conn.pageInfo.hasNextPage) break;
    afterCursor = conn.pageInfo.endCursor;
    if (!afterCursor) break;
  }

  return nodes;
}

export async function fetchNauticalProductTypeById(id: string): Promise<NauticalProductTypeNode | null> {
  try {
    const data = await executeTraideQuery<{ productType: NauticalProductTypeNode | null }>("productTypeById", {
      id,
    });
    if (data.productType) return data.productType;
  } catch {
    /* Some Traide deployments omit productType(id); fall back to the list. */
  }
  const all = await fetchAllNauticalProductTypes();
  return all.find((node) => node.id === id) ?? null;
}
