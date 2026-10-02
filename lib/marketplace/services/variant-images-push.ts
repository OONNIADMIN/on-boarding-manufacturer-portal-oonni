import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LOCAL_INVENTORY_PREFIX } from "@/lib/inventory-access";
import { getNauticalConfig, nauticalNotConfiguredMessage } from "@/lib/marketplace/graphql/client";
import {
  collectImageRecords,
  imageMatchKey,
  isMarketplaceImageId,
  parseVariantImages,
  toInventoryImages,
  type MarketplaceVariantImageInput,
} from "@/lib/marketplace/mappers/variant-images";
import { productImageBulkDelete } from "@/lib/marketplace/operations/product-image-bulk-delete";
import { productImageCreate } from "@/lib/marketplace/operations/product-image-create";
import { orderedMarketplaceImageIds, productImageReorder } from "@/lib/marketplace/operations/product-image-reorder";
import { productVariantImageAssign } from "@/lib/marketplace/operations/variant-image-assign";
import { normalizeInventoryImages } from "@/lib/inventory-crud";

const MARKETPLACE_IMAGE_COUNTRY_CODE = "US";

function isLocalId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(LOCAL_INVENTORY_PREFIX));
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function imageIds(images: MarketplaceVariantImageInput[]): string[] {
  return images.map((image) => image.id).filter((id): id is string => Boolean(id) && isMarketplaceImageId(id));
}

function recoverMarketplaceImageId(
  image: MarketplaceVariantImageInput,
  known: MarketplaceVariantImageInput[]
): string | null {
  if (image.id && isMarketplaceImageId(image.id)) return image.id;
  const key = imageMatchKey(image.url);
  const match = known.find(
    (row) =>
      Boolean(row.id && isMarketplaceImageId(row.id)) &&
      (row.url === image.url || imageMatchKey(row.url) === key)
  );
  return match?.id ?? null;
}

function recoveryImagesFromVariant(variant: {
  images: unknown;
  payload: unknown;
  nautical_id: string | null;
  product: { payload: unknown };
}): MarketplaceVariantImageInput[] {
  const fromColumn = collectImageRecords(variant.images);
  const fromVariantPayload = collectImageRecords(variant.payload);
  const nested = (variant.product.payload as { variants?: unknown } | null)?.variants;
  const fromProductVariants: MarketplaceVariantImageInput[] = [];
  if (Array.isArray(nested) && variant.nautical_id) {
    const match = nested.find((item) => {
      if (!item || typeof item !== "object") return false;
      return String((item as { id?: unknown }).id ?? "") === variant.nautical_id;
    });
    if (match) fromProductVariants.push(...collectImageRecords(match));
  }
  return [...fromColumn, ...fromVariantPayload, ...fromProductVariants];
}

/**
 * Same Marketplace flow as middleware `product_images_create` + `product_variant_images_assign`:
 * create images on the parent product from URLs, then assign those image IDs to the variant.
 * Local ImageKit URLs are always persisted; Marketplace CDN URLs are never written back over DAM urls.
 */
export async function pushVariantImagesToMarketplace(
  variantId: number,
  previousImages?: unknown
): Promise<{ errors: string[] }> {
  if (!getNauticalConfig()) {
    return { errors: [nauticalNotConfiguredMessage()] };
  }

  const variant = await prisma.inventoryVariant.findFirst({
    where: { id: variantId },
    include: {
      product: { select: { id: true, nautical_id: true, deleted_at: true, payload: true } },
    },
  });
  if (!variant || variant.product.deleted_at) {
    return { errors: [`Variant ${variantId} not found`] };
  }

  const productId = variant.product.nautical_id;
  const marketplaceVariantId = variant.nautical_id;
  if (!productId || isLocalId(productId)) {
    return { errors: [`Variant ${variant.id} parent product is not in your catalog yet. Save the product first.`] };
  }
  if (!marketplaceVariantId || isLocalId(marketplaceVariantId)) {
    return { errors: [`Variant ${variant.id} is not in your catalog yet. Save the variant first.`] };
  }

  const known = [
    ...parseVariantImages(previousImages ?? [], previousImages ?? []),
    ...recoveryImagesFromVariant(variant),
  ];
  const intended = parseVariantImages(variant.images, known).map((image) => ({
    ...image,
    id: recoverMarketplaceImageId(image, known),
  }));
  const previousIds = imageIds(parseVariantImages(previousImages ?? [], previousImages ?? []));
  const errors: string[] = [];
  const persisted: MarketplaceVariantImageInput[] = [];

  for (const image of intended) {
    if (image.id && isMarketplaceImageId(image.id)) {
      persisted.push(image);
      continue;
    }
    try {
      const result = await productImageCreate({
        url: image.url,
        product: productId,
        transferImageOwnership: true,
        externalId: image.code,
        externalSource: image.source || "imagekit",
      });
      if (result.errors.length || !result.imageId) {
        errors.push(
          `Variant ${variant.id} image ${image.url}: ${result.errors.join("; ") || "this photo could not be published"}`
        );
        persisted.push({ ...image, id: null });
        continue;
      }
      const created = { ...image, id: result.imageId };
      try {
        const assigned = await productVariantImageAssign(
          result.imageId,
          marketplaceVariantId,
          MARKETPLACE_IMAGE_COUNTRY_CODE
        );
        if (assigned.errors.length) {
          errors.push(`Variant ${variant.id} assign ${image.url}: ${assigned.errors.join("; ")}`);
        }
      } catch (e) {
        errors.push(
          `Variant ${variant.id} assign ${image.url}: ${e instanceof Error ? e.message : "failed to assign"}`
        );
      }
      persisted.push(created);
    } catch (e) {
      errors.push(`Variant ${variant.id} image ${image.url}: ${e instanceof Error ? e.message : "failed to create"}`);
      persisted.push({ ...image, id: null });
    }
  }

  const persistedIds = new Set(imageIds(persisted));
  const removedIds = previousIds.filter((id) => !persistedIds.has(id));
  if (removedIds.length) {
    try {
      const deleted = await productImageBulkDelete(removedIds);
      errors.push(...deleted.errors.map((message) => `Variant ${variant.id} image delete: ${message}`));
    } catch (e) {
      errors.push(
        `Variant ${variant.id} image delete: ${e instanceof Error ? e.message : "failed to delete removed images"}`
      );
    }
  }

  await prisma.inventoryVariant.update({
    where: { id: variant.id },
    data: { images: asJson(toInventoryImages(persisted)) },
  });

  try {
    const siblings = await prisma.inventoryVariant.findMany({
      where: { inventory_product_id: variant.product.id, id: { not: variant.id } },
      select: { images: true },
    });
    const productImages = await prisma.inventoryProduct.findFirst({
      where: { id: variant.product.id },
      select: { images: true },
    });
    const imagesIds = [
      ...orderedMarketplaceImageIds(persisted),
      ...siblings.flatMap((row) => orderedMarketplaceImageIds(normalizeInventoryImages(row.images))),
      ...orderedMarketplaceImageIds(normalizeInventoryImages(productImages?.images)),
    ].filter((id, index, all) => all.indexOf(id) === index);
    if (imagesIds.length >= 2) {
      const reordered = await productImageReorder(productId, imagesIds);
      errors.push(
        ...reordered.errors.map((message) => `Variant ${variant.id} photo order: ${message}`)
      );
    }
  } catch (e) {
    errors.push(
      `Variant ${variant.id} photo order: ${e instanceof Error ? e.message : "could not update photo order"}`
    );
  }

  return { errors };
}

export async function pushVariantImagesForIds(
  variantIds: number[],
  previousById?: Map<number, unknown>
): Promise<string[]> {
  const errors: string[] = [];
  for (const variantId of variantIds) {
    const result = await pushVariantImagesToMarketplace(variantId, previousById?.get(variantId));
    errors.push(...result.errors);
  }
  return errors;
}
