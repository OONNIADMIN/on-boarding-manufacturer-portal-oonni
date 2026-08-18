/**
 * Fetch Nautical marketplace products for a seller and persist them locally.
 * Product/variant attributes stay as JSON so GraphQL fields can change without migrations.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LOCAL_INVENTORY_PREFIX } from "@/lib/inventory-access";
import { nauticalGraphql } from "@/lib/nautical-client";

export const INVENTORY_PRODUCTS_QUERY = `
query InventoryProducts($first: Int!, $after: String, $seller: ID!) {
  products(first: $first, after: $after, filter: { seller: $seller, isStaff: true }) {
    pageInfo {
      endCursor
      hasNextPage
      hasPreviousPage
      startCursor
    }
    edges {
      node {
        slug
        id
        name
        images {
          url
        }
        descriptionHtml
        description
        currency
        seoTitle
        seoDescription
        externalId
        isDigital
        isShippingRequired
        isBundle
        allowSellerVariants
        availableForPurchase
        status
        isPublished
        dimensions {
          length
          width
          height
          unit
        }
        warnings {
          code
          message
        }
        hasWarnings
        hasVariantOptions
        category {
          id
          slug
          name
        }
        productType {
          id
          slug
          name
        }
        attributes {
          attribute {
            name
          }
          values {
            slug
            name
            value
          }
        }
        variants {
          id
          name
          sku
          seoDescription
          dimensions {
            width
            height
            length
            unit
          }
          attributes {
            attribute {
              name
            }
            values {
              name
              value
            }
          }
        }
      }
    }
  }
}
`;

export const APPROVED_SELLERS_QUERY = `
query ApprovedSellers($search: String!) {
  sellers(first: 100, filter: { search: $search, status: APPROVED }) {
    edges {
      node {
        companyName
        id
      }
    }
  }
}
`;

/** Same Authorization: Bearer header as InventoryProducts. */
function nauticalQuery<T>(query: string, variables?: Record<string, unknown>) {
  return nauticalGraphql<T>(query, variables);
}

type AttributeValue = {
  slug?: string | null;
  name?: string | null;
  value?: string | null;
};

type NamedAttribute = {
  attribute?: {
    name?: string | null;
    values?: AttributeValue[] | null;
  } | null;
  values?: AttributeValue[] | null;
};

export type NauticalInventoryProductNode = {
  id: string;
  slug: string;
  name: string;
  images?: Array<{ url?: string | null }> | null;
  descriptionHtml?: string | null;
  description?: string | null;
  currency?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  externalId?: string | null;
  isDigital?: boolean | null;
  isShippingRequired?: boolean | null;
  isBundle?: boolean | null;
  allowSellerVariants?: boolean | null;
  availableForPurchase?: boolean | null;
  status?: string | null;
  isPublished?: boolean | null;
  dimensions?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    unit?: string | null;
  } | null;
  warnings?: Array<{ code?: string | null; message?: string | null }> | null;
  hasWarnings?: boolean | null;
  hasVariantOptions?: boolean | null;
  category?: { id?: string | null; slug?: string | null; name?: string | null } | null;
  productType?: { id?: string | null; slug?: string | null; name?: string | null } | null;
  attributes?: NamedAttribute[] | null;
  variants?: Array<{
    id: string;
    name?: string | null;
    sku?: string | null;
    seoDescription?: string | null;
    dimensions?: {
      length?: number | null;
      width?: number | null;
      height?: number | null;
      unit?: string | null;
    } | null;
    attributes?: NamedAttribute[] | null;
  }> | null;
};

type ProductsConnection = {
  products: {
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
    };
    edges: Array<{ node: NauticalInventoryProductNode }>;
  };
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function firstAttributeValue(values: AttributeValue[] | null | undefined): string | null {
  const first = (values ?? []).find((v) => v?.name || v?.value);
  if (!first) return null;
  return String(first.name || first.value || "").trim() || null;
}

function mapAttributes(list: NamedAttribute[] | null | undefined) {
  return (list ?? [])
    .map((item) => {
      const name = item.attribute?.name?.trim();
      if (!name) return null;
      const assigned = item.values?.length ? item.values : item.attribute?.values;
      return {
        name,
        value: firstAttributeValue(assigned),
      };
    })
    .filter(Boolean);
}

type ApprovedSellerNode = {
  id: string;
  companyName?: string | null;
};

function pickApprovedSeller(nodes: ApprovedSellerNode[], search: string): string | null {
  const needle = search.trim().toLowerCase();
  if (!needle) return null;
  const sellers = nodes.filter((node) => node.id);
  const exact = sellers.find((node) => (node.companyName ?? "").trim().toLowerCase() === needle);
  if (exact?.id) return exact.id;
  const partial = sellers.find((node) => {
    const company = (node.companyName ?? "").trim().toLowerCase();
    return company.includes(needle) || needle.includes(company);
  });
  if (partial?.id) return partial.id;
  if (sellers.length === 1) return sellers[0].id;
  return null;
}

async function searchApprovedSellerId(search: string): Promise<string | null> {
  const query = search.trim();
  if (!query) return null;
  const data = await nauticalQuery<{
    sellers: { edges: Array<{ node: ApprovedSellerNode }> };
  }>(APPROVED_SELLERS_QUERY, { search: query });
  return pickApprovedSeller(
    data.sellers.edges.map((edge) => edge.node),
    query
  );
}

async function resolveSellerId(manufacturer: {
  id: number;
  name: string;
  slug: string;
  nautical_seller_id: string | null;
}): Promise<string> {
  const companyName = manufacturer.name.trim();
  if (!companyName) {
    throw new Error("Company name is missing. Set it on the manufacturer profile before syncing inventory.");
  }

  try {
    const sellerId = await searchApprovedSellerId(companyName);
    if (sellerId) return sellerId;
  } catch (e) {
    throw e instanceof Error
      ? e
      : new Error(`Nautical seller lookup failed for Company "${companyName}".`);
  }

  const cached = manufacturer.nautical_seller_id?.trim();
  if (cached) return cached;

  throw new Error(
    `No approved Nautical seller matched Company "${companyName}".`
  );
}

export async function fetchNauticalInventoryProducts(sellerId: string): Promise<NauticalInventoryProductNode[]> {
  const nodes: NauticalInventoryProductNode[] = [];
  let after: string | null = null;

  for (;;) {
    const data = await nauticalQuery<ProductsConnection>(INVENTORY_PRODUCTS_QUERY, {
      first: 100,
      after,
      seller: sellerId,
    });
    const conn = data.products;
    for (const edge of conn.edges) {
      if (edge.node) nodes.push(edge.node);
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    if (!after) break;
  }

  return nodes;
}

export async function syncManufacturerInventory(manufacturerId: number): Promise<{
  seller_id: string;
  products_synced: number;
  variants_synced: number;
}> {
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: manufacturerId },
  });
  if (!manufacturer || manufacturer.deleted_at) {
    throw new Error("Manufacturer not found");
  }

  const sellerId = await resolveSellerId(manufacturer);
  if (manufacturer.nautical_seller_id !== sellerId) {
    await prisma.manufacturer.update({
      where: { id: manufacturerId },
      data: { nautical_seller_id: sellerId },
    });
  }

  const nodes = await fetchNauticalInventoryProducts(sellerId);
  const seenIds = new Set<string>();
  let variantsSynced = 0;
  const now = new Date();

  for (const node of nodes) {
    if (!node.id) continue;
    seenIds.add(node.id);
    const attributes = mapAttributes(node.attributes);
    const variants = node.variants ?? [];

    const product = await prisma.inventoryProduct.upsert({
      where: {
        manufacturer_id_nautical_id: {
          manufacturer_id: manufacturerId,
          nautical_id: node.id,
        },
      },
      create: {
        manufacturer_id: manufacturerId,
        nautical_id: node.id,
        slug: node.slug ?? "",
        name: node.name ?? "",
        description: node.description ?? null,
        description_html: node.descriptionHtml ?? null,
        currency: node.currency ?? null,
        seo_title: node.seoTitle ?? null,
        seo_description: node.seoDescription ?? null,
        external_id: node.externalId ?? null,
        is_digital: Boolean(node.isDigital),
        is_shipping_required: node.isShippingRequired !== false,
        is_bundle: Boolean(node.isBundle),
        allow_seller_variants: Boolean(node.allowSellerVariants),
        available_for_purchase: node.availableForPurchase !== false,
        status: node.status ?? null,
        is_published: Boolean(node.isPublished),
        has_warnings: Boolean(node.hasWarnings),
        has_variant_options: Boolean(node.hasVariantOptions),
        images: asJson(node.images ?? []),
        dimensions: node.dimensions ? asJson(node.dimensions) : Prisma.JsonNull,
        warnings: node.warnings ? asJson(node.warnings) : Prisma.JsonNull,
        category: node.category ? asJson(node.category) : Prisma.JsonNull,
        product_type: node.productType ? asJson(node.productType) : Prisma.JsonNull,
        attributes: asJson(attributes),
        payload: asJson(node),
        synced_at: now,
        deleted_at: null,
      },
      update: {
        slug: node.slug ?? "",
        name: node.name ?? "",
        description: node.description ?? null,
        description_html: node.descriptionHtml ?? null,
        currency: node.currency ?? null,
        seo_title: node.seoTitle ?? null,
        seo_description: node.seoDescription ?? null,
        external_id: node.externalId ?? null,
        is_digital: Boolean(node.isDigital),
        is_shipping_required: node.isShippingRequired !== false,
        is_bundle: Boolean(node.isBundle),
        allow_seller_variants: Boolean(node.allowSellerVariants),
        available_for_purchase: node.availableForPurchase !== false,
        status: node.status ?? null,
        is_published: Boolean(node.isPublished),
        has_warnings: Boolean(node.hasWarnings),
        has_variant_options: Boolean(node.hasVariantOptions),
        images: asJson(node.images ?? []),
        dimensions: node.dimensions ? asJson(node.dimensions) : Prisma.JsonNull,
        warnings: node.warnings ? asJson(node.warnings) : Prisma.JsonNull,
        category: node.category ? asJson(node.category) : Prisma.JsonNull,
        product_type: node.productType ? asJson(node.productType) : Prisma.JsonNull,
        attributes: asJson(attributes),
        payload: asJson(node),
        synced_at: now,
        deleted_at: null,
      },
    });

    const variantIds = variants.map((v) => v.id).filter(Boolean);
    await prisma.inventoryVariant.deleteMany({
      where: {
        inventory_product_id: product.id,
        NOT: { nautical_id: { startsWith: LOCAL_INVENTORY_PREFIX } },
        ...(variantIds.length ? { nautical_id: { notIn: variantIds } } : {}),
      },
    });

    for (const variant of variants) {
      if (!variant.id) continue;
      variantsSynced += 1;
      const variantAttributes = mapAttributes(variant.attributes);
      await prisma.inventoryVariant.upsert({
        where: {
          inventory_product_id_nautical_id: {
            inventory_product_id: product.id,
            nautical_id: variant.id,
          },
        },
        create: {
          inventory_product_id: product.id,
          nautical_id: variant.id,
          name: variant.name ?? "",
          sku: variant.sku ?? null,
          seo_description: variant.seoDescription ?? null,
          dimensions: variant.dimensions ? asJson(variant.dimensions) : Prisma.JsonNull,
          attributes: asJson(variantAttributes),
          payload: asJson(variant),
        },
        update: {
          name: variant.name ?? "",
          sku: variant.sku ?? null,
          seo_description: variant.seoDescription ?? null,
          dimensions: variant.dimensions ? asJson(variant.dimensions) : Prisma.JsonNull,
          attributes: asJson(variantAttributes),
          payload: asJson(variant),
        },
      });
    }
  }

  await prisma.inventoryProduct.updateMany({
    where: {
      manufacturer_id: manufacturerId,
      deleted_at: null,
      AND: [
        { nautical_id: { notIn: [...seenIds] } },
        { NOT: { nautical_id: { startsWith: LOCAL_INVENTORY_PREFIX } } },
      ],
    },
    data: { deleted_at: now },
  });

  return {
    seller_id: sellerId,
    products_synced: nodes.length,
    variants_synced: variantsSynced,
  };
}
