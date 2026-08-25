import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductImageReorderPayload } from "@/app/graphql";
import { isTraideImageId } from "@/lib/traide/mappers/variant-images";

/** Ordered Traide ProductImage ids from inventory variant/product image rows. */
export function orderedTraideImageIds(images: Array<{ id?: string | null } | null | undefined>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const image of images) {
    const id = String(image?.id ?? "").trim();
    if (!isTraideImageId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function productImageReorder(
  productId: string,
  imagesIds: string[]
): Promise<{ images: ProductImageReorderPayload["productImageReorder"]["images"]; errors: string[] }> {
  const ids = orderedTraideImageIds(imagesIds.map((id) => ({ id })));
  if (!productId.trim() || ids.length < 2) {
    return { images: null, errors: [] };
  }

  const data = await executeTraideMutation<ProductImageReorderPayload>("productImageReorder", {
    productId,
    imagesIds: ids,
  });
  const errors = (data.productImageReorder.productErrors ?? [])
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean);
  return { images: data.productImageReorder.images ?? null, errors };
}
