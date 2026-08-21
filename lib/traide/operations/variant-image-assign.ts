import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductVariantImageAssignPayload } from "@/app/graphql";

export async function productVariantImageAssign(
  imageId: string,
  variantId: string,
  countryCode = "US"
): Promise<{ errors: string[] }> {
  const data = await executeTraideMutation<ProductVariantImageAssignPayload>("productVariantImageAssign", {
    imageId,
    variantId,
    countryCode,
  });
  const errors = (data.productVariantImageAssign.productErrors ?? [])
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean);
  return { errors };
}
