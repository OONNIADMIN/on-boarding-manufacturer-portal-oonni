import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LOCAL_INVENTORY_PREFIX } from "@/lib/inventory-access";
import { getNauticalConfig, nauticalNotConfiguredMessage } from "@/lib/traide/graphql/client";
import {
  collectImageRecords,
  imageMatchKey,
  isTraideImageId,
  parseVariantImages,
  toInventoryImages,
  type TraideVariantImageInput,
} from "@/lib/traide/mappers/variant-images";
import { productImageBulkDelete } from "@/lib/traide/operations/product-image-bulk-delete";
import { productImageCreate } from "@/lib/traide/operations/product-image-create";
import { productVariantImageAssign } from "@/lib/traide/operations/variant-image-assign";

const TRAIDE_IMAGE_COUNTRY_CODE = "US";

function isLocalId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(LOCAL_INVENTORY_PREFIX));
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function imageIds(images: TraideVariantImageInput[]): string[] {
  return images.map((image) => image.id).filter((id): id is string => Boolean(id) && isTraideImageId(id));
}

function recoverTraideImageId(
  image: TraideVariantImageInput,
  known: TraideVariantImageInput[]
): string | null {
  if (image.id && isTraideImageId(image.id)) return image.id;
  const key = imageMatchKey(image.url);
  const match = known.find(
    (row) =>
      Boolean(row.id && isTraideImageId(row.id)) &&
      (row.url === image.url || imageMatchKey(row.url) === key)
  );
  return match?.id ?? null;
}

function recoveryImagesFromVariant(variant: {
  images: unknown;
  payload: unknown;
  nautical_id: string | null;
  product: { payload: unknown };
}): TraideVariantImageInput[] {
  const fromColumn = collectImageRecords(variant.images);
  const fromVariantPayload = collectImageRecords(variant.payload);
  const nested = (variant.product.payload as { variants?: unknown } | null)?.variants;
  const fromProductVariants: TraideVariantImageInput[] = [];
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
 * Same Traide flow as middleware `product_images_create` + `product_variant_images_assign`:
 * create images on the parent product from URLs, then assign those image IDs to the variant.
 * Local ImageKit URLs are always persisted; Traide CDN URLs are never written back over DAM urls.
 */
export async function pushVariantImagesToTraide(
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
  const traideVariantId = variant.nautical_id;
  if (!productId || isLocalId(productId)) {
    return { errors: [`Variant ${variant.id} parent product is not in your catalog yet. Save the product first.`] };
  }
  if (!traideVariantId || isLocalId(traideVariantId)) {
    return { errors: [`Variant ${variant.id} is not in your catalog yet. Save the variant first.`] };
  }

  const known = [
    ...parseVariantImages(previousImages ?? [], previousImages ?? []),
    ...recoveryImagesFromVariant(variant),
  ];
  const intended = parseVariantImages(variant.images, known).map((image) => ({
    ...image,
    id: recoverTraideImageId(image, known),
  }));
  const previousIds = imageIds(parseVariantImages(previousImages ?? [], previousImages ?? []));
  const errors: string[] = [];
  const persisted: TraideVariantImageInput[] = [];

  for (const image of intended) {
    if (image.id && isTraideImageId(image.id)) {
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
          traideVariantId,
          TRAIDE_IMAGE_COUNTRY_CODE
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
  return { errors };
}

export async function pushVariantImagesForIds(
  variantIds: number[],
  previousById?: Map<number, unknown>
): Promise<string[]> {
  const errors: string[] = [];
  for (const variantId of variantIds) {
    const result = await pushVariantImagesToTraide(variantId, previousById?.get(variantId));
    errors.push(...result.errors);
  }
  return errors;
}
