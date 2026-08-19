import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TRAIDE_MUTATION_BATCH_SIZE } from "@/lib/traide/constants";
import { getNauticalConfig, nauticalNotConfiguredMessage } from "@/lib/traide/graphql/client";
import type { TraideProductBulkCreateInput } from "@/lib/traide/mappers/product-input";
import {
  isLocalTraideId,
  resolveProductTypeId,
  toProductBulkCreateInput,
  toProductUpdateInput,
  type InventoryProductLike,
} from "@/lib/traide/mappers/product-input";
import type { TraideProductVariantBulkCreateInput } from "@/lib/traide/mappers/variant-input";
import { toVariantBulkCreateInput, toVariantUpdateInput, type InventoryVariantLike } from "@/lib/traide/mappers/variant-input";
import { attributesForVariantUpdate } from "@/lib/traide/mappers/attribute-input";
import { productBulkCreate } from "@/lib/traide/operations/product-bulk-create";
import { productUpdate } from "@/lib/traide/operations/product-update";
import { fetchAllNauticalProductTypes } from "@/lib/traide/operations/product-types";
import { resolveManufacturerSellerId } from "@/lib/traide/operations/sellers";
import { productVariantBulkCreate } from "@/lib/traide/operations/variant-bulk-create";
import { productVariantUpdate } from "@/lib/traide/operations/product-variant-update";
import { pushVariantImagesForIds } from "@/lib/traide/services/variant-images-push";

export type TraidePushResult = {
  traide_synced: number;
  traide_errors: string[];
};

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  nautical_id: true,
  external_id: true,
  description: true,
  description_html: true,
  currency: true,
  seo_title: true,
  seo_description: true,
  is_digital: true,
  is_shipping_required: true,
  is_published: true,
  available_for_purchase: true,
  status: true,
  category: true,
  product_type: true,
  attributes: true,
  payload: true,
  dimensions: true,
} satisfies Prisma.InventoryProductSelect;

function emptyPush(): TraidePushResult {
  return { traide_synced: 0, traide_errors: [] };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function mergePayload(existing: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return asJson({ ...base, ...patch });
}

async function loadManufacturerForPush(manufacturerId: number) {
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: manufacturerId },
    select: { id: true, name: true, nautical_seller_id: true, deleted_at: true },
  });
  if (!manufacturer || manufacturer.deleted_at) {
    throw new Error("Manufacturer not found");
  }
  return manufacturer;
}

async function resolveSellerForPush(manufacturerId: number): Promise<string> {
  const manufacturer = await loadManufacturerForPush(manufacturerId);
  const sellerId = await resolveManufacturerSellerId(manufacturer);
  if (manufacturer.nautical_seller_id !== sellerId) {
    await prisma.manufacturer.update({
      where: { id: manufacturer.id },
      data: { nautical_seller_id: sellerId },
    });
  }
  return sellerId;
}

export async function pushInventoryProductsToTraide(
  manufacturerId: number,
  productIds: number[]
): Promise<TraidePushResult> {
  if (!productIds.length) return emptyPush();
  if (!getNauticalConfig()) {
    return { traide_synced: 0, traide_errors: [nauticalNotConfiguredMessage()] };
  }

  const errors: string[] = [];
  try {
    const sellerId = await resolveSellerForPush(manufacturerId);
    const products = await prisma.inventoryProduct.findMany({
      where: { manufacturer_id: manufacturerId, id: { in: productIds }, deleted_at: null },
      select: PRODUCT_SELECT,
    });
    const productTypes = await fetchAllNauticalProductTypes();
    const toCreate: Array<{ row: InventoryProductLike; input: TraideProductBulkCreateInput }> = [];
    let synced = 0;

    for (const product of products) {
      if (!isLocalTraideId(product.nautical_id) && product.nautical_id) {
        const result = toProductUpdateInput(product, { sellerId, productTypes });
        if ("error" in result) {
          errors.push(result.error);
          continue;
        }
        try {
          const response = await productUpdate(result.id, result.input);
          errors.push(...response.errors.map((message) => `Product ${product.id}: ${message}`));
          if (response.product?.id && !response.errors.length) {
            synced += 1;
            await prisma.inventoryProduct.update({
              where: { id: product.id },
              data: {
                nautical_id: response.product.id,
                external_id: product.external_id,
                payload: mergePayload(product.payload, {
                  id: response.product.id,
                  externalId: product.external_id,
                }),
              },
            });
          }
        } catch (e) {
          errors.push(`Product ${product.id}: ${e instanceof Error ? e.message : "failed to update Traide"}`);
        }
        continue;
      }

      const result = toProductBulkCreateInput(product, { sellerId, productTypes });
      if ("error" in result) {
        errors.push(result.error);
        continue;
      }
      toCreate.push({ row: product, input: result.input });
    }

    if (toCreate.length) {
      const response = await productBulkCreate(
        toCreate.map((item) => item.input),
        TRAIDE_MUTATION_BATCH_SIZE
      );
      errors.push(...response.errors);
      synced += Math.max(0, toCreate.length - response.errors.length);

      const byExternalId = new Map(
        response.products
          .filter((item) => item.externalId)
          .map((item) => [item.externalId as string, item])
      );

      for (const item of toCreate) {
        const created = byExternalId.get(item.input.externalId);
        if (!created?.id) continue;
        try {
          await prisma.inventoryProduct.update({
            where: { id: item.row.id },
            data: {
              nautical_id: created.id,
              external_id: item.input.externalId,
              payload: mergePayload(item.row.payload, {
                id: created.id,
                externalId: item.input.externalId,
                externalSource: item.input.externalSource,
              }),
            },
          });
        } catch (e) {
          errors.push(
            `Product ${item.row.id}: ${e instanceof Error ? e.message : "failed to save Traide id"}`
          );
        }
      }
    }

    return {
      traide_synced: synced,
      traide_errors: errors.slice(0, 50),
    };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Failed to push products to Traide");
    return { traide_synced: 0, traide_errors: errors.slice(0, 50) };
  }
}

export async function pushInventoryVariantsToTraide(
  manufacturerId: number,
  variantIds: number[],
  options?: { previousImagesById?: Map<number, unknown> }
): Promise<TraidePushResult> {
  if (!variantIds.length) return emptyPush();
  if (!getNauticalConfig()) {
    return { traide_synced: 0, traide_errors: [nauticalNotConfiguredMessage()] };
  }

  const errors: string[] = [];
  let synced = 0;
  try {
    const sellerId = await resolveSellerForPush(manufacturerId);
    const variants = await prisma.inventoryVariant.findMany({
      where: {
        id: { in: variantIds },
        product: { manufacturer_id: manufacturerId, deleted_at: null },
      },
      include: { product: { select: PRODUCT_SELECT } },
    });
    let rows = variants;
    const localParentIds = [
      ...new Set(
        rows.filter((variant) => isLocalTraideId(variant.product.nautical_id)).map((variant) => variant.product.id)
      ),
    ];
    if (localParentIds.length) {
      const parentPush = await pushInventoryProductsToTraide(manufacturerId, localParentIds);
      errors.push(...parentPush.traide_errors);
      rows = await prisma.inventoryVariant.findMany({
        where: {
          id: { in: variantIds },
          product: { manufacturer_id: manufacturerId, deleted_at: null },
        },
        include: { product: { select: PRODUCT_SELECT } },
      });
    }

    const productTypes = await fetchAllNauticalProductTypes();
    const grouped = new Map<
      string,
      Array<{ row: InventoryVariantLike; input: TraideProductVariantBulkCreateInput }>
    >();

    for (const variant of rows) {
      const typeId = resolveProductTypeId(variant.product, productTypes);
      const catalog = productTypes.find((item) => item.id === typeId)?.variantAttributes ?? [];

      if (!isLocalTraideId(variant.nautical_id) && variant.nautical_id) {
        const result = toVariantUpdateInput(variant, { sellerId, catalog });
        if ("error" in result) {
          errors.push(result.error);
          continue;
        }
        try {
          const response = await productVariantUpdate(result.id, result.input);
          errors.push(...response.errors.map((message) => `Variant ${variant.id}: ${message}`));
          if (response.productVariant?.id && !response.errors.length) {
            synced += 1;
            await prisma.inventoryVariant.update({
              where: { id: variant.id },
              data: {
                nautical_id: response.productVariant.id,
                payload: mergePayload(variant.payload, {
                  id: response.productVariant.id,
                  sku: result.input.sku,
                }),
              },
            });
          }
        } catch (e) {
          errors.push(`Variant ${variant.id}: ${e instanceof Error ? e.message : "failed to update Traide"}`);
        }
        continue;
      }

      const result = toVariantBulkCreateInput(variant, { sellerId, catalog });
      if ("error" in result) {
        errors.push(result.error);
        continue;
      }
      const parentId = variant.product.nautical_id;
      const list = grouped.get(parentId) ?? [];
      list.push({ row: variant, input: result.input });
      grouped.set(parentId, list);
    }

    if (grouped.size) {
      for (const [productId, items] of grouped) {
      const response = await productVariantBulkCreate(
        productId,
        items.map((item) => item.input),
        TRAIDE_MUTATION_BATCH_SIZE
      );
      errors.push(...response.errors);
      synced += Math.max(0, items.length - response.errors.length);
      const bySku = new Map(
        response.productVariants
          .filter((item) => item.sku)
          .map((item) => [String(item.sku), item])
      );
      for (const item of items) {
        const created = bySku.get(item.input.sku);
        if (!created?.id) continue;
        try {
          await prisma.inventoryVariant.update({
            where: { id: item.row.id },
            data: {
              nautical_id: created.id,
              payload: mergePayload(item.row.payload, {
                id: created.id,
                sku: item.input.sku,
                externalId: item.input.externalId,
              }),
            },
          });
        } catch (e) {
          errors.push(
            `Variant ${item.row.id}: ${e instanceof Error ? e.message : "failed to save Traide id"}`
          );
        }
        if (item.input.attributes.length) {
          try {
            const attrUpdate = await productVariantUpdate(created.id, {
              name: item.input.name,
              sku: item.input.sku,
              attributes: attributesForVariantUpdate(item.input.attributes),
              ...(item.input.dimensions ? { dimensions: item.input.dimensions } : {}),
            });
            errors.push(...attrUpdate.errors.map((message) => `Variant ${item.row.id}: ${message}`));
          } catch (e) {
            errors.push(
              `Variant ${item.row.id}: ${e instanceof Error ? e.message : "failed to update Traide attributes"}`
            );
          }
        }
      }
      }
    }

    const imageErrors = await pushVariantImagesForIds(
      rows.map((variant) => variant.id),
      options?.previousImagesById
    );
    errors.push(...imageErrors);

    return { traide_synced: synced, traide_errors: errors.slice(0, 50) };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Failed to push variants to Traide");
    return { traide_synced: synced, traide_errors: errors.slice(0, 50) };
  }
}
