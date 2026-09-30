import { executeMarketplaceMutation } from "@/lib/marketplace/graphql/client";
import type { ProductImageReorderPayload } from "@/app/graphql";
import { isMarketplaceImageId } from "@/lib/marketplace/mappers/variant-images";

/** Ordered Marketplace ProductImage ids from inventory variant/product image rows. */
export function orderedMarketplaceImageIds(images: Array<{ id?: string | null } | null | undefined>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const image of images) {
    const id = String(image?.id ?? "").trim();
    if (!isMarketplaceImageId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function productImageReorder(
  productId: string,
  imagesIds: string[]
): Promise<{ images: ProductImageReorderPayload["productImageReorder"]["images"]; errors: string[] }> {
  const ids = orderedMarketplaceImageIds(imagesIds.map((id) => ({ id })));
  if (!productId.trim() || ids.length < 2) {
    return { images: null, errors: [] };
  }

  const data = await executeMarketplaceMutation<ProductImageReorderPayload>("productImageReorder", {
    productId,
    imagesIds: ids,
  });
  const errors = (data.productImageReorder.productErrors ?? [])
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean);
  return { images: data.productImageReorder.images ?? null, errors };
}
