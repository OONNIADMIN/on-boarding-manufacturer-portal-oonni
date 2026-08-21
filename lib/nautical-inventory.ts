/**
 * Fetch Nautical marketplace products for a seller and persist them locally.
 * Product/variant attributes stay as JSON so GraphQL fields can change without migrations.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LOCAL_INVENTORY_PREFIX } from "@/lib/inventory-access";
import { persistInventoryAttributes } from "@/lib/inventory-attributes";
import { normalizeInventoryImages } from "@/lib/inventory-crud";
import { executeTraideQuery } from "@/lib/traide/graphql/client";
import { resolveManufacturerSellerId } from "@/lib/traide/operations/sellers";

export { INVENTORY_PRODUCTS_QUERY, APPROVED_SELLERS_QUERY } from "@/app/graphql";

type AttributeValue = {
  slug?: string | null;
  name?: string | null;
  plainText?: string | null;
  richText?: string | null;
  boolean?: boolean | null;
  amount?: string | number | null;
};

type NamedAttribute = {
  attribute?: {
    id?: string | null;
    slug?: string | null;
    name?: string | null;
    inputType?: string | null;
    valueRequired?: boolean | null;
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
  externalSource?: string | null;
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
    images?: Array<{ id?: string | null; url?: string | null }> | null;
    media?: Array<{ id?: string | null; url?: string | null }> | null;
    externalId?: string | null;
    externalSource?: string | null;
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

function collectVariantImages(variant: { images?: unknown; media?: unknown }) {
  const fromImages = normalizeInventoryImages(variant.images);
  if (fromImages.length) return fromImages;
  return normalizeInventoryImages(variant.media);
}

async function persistVariantImages(variantRowId: number, images: unknown) {
  await prisma.inventoryVariant.update({
    where: { id: variantRowId },
    data: { images: asJson(images ?? []) },
  });
}

export async function fetchNauticalInventoryProducts(sellerId: string): Promise<NauticalInventoryProductNode[]> {
  const nodes: NauticalInventoryProductNode[] = [];
  let after: string | null = null;
  const maxPages = 50;

  for (let page = 0; page < maxPages; page += 1) {
    const data: ProductsConnection = await executeTraideQuery<ProductsConnection>("inventoryProducts", {
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

  const sellerId = await resolveManufacturerSellerId(manufacturer);
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
    const attributes = persistInventoryAttributes(node.attributes);
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
      const variantAttributes = persistInventoryAttributes(variant.attributes);
      const variantImages = collectVariantImages(variant);
      const saved = await prisma.inventoryVariant.upsert({
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
      await persistVariantImages(saved.id, variantImages);
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
