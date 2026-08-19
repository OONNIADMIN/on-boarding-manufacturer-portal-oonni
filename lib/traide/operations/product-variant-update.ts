import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductVariantUpdatePayload, TraideProductError } from "@/app/graphql";
import type { TraideProductVariantUpdateInput } from "@/lib/traide/mappers/variant-input";

function formatVariantError(error: TraideProductError): string {
  const parts = [error.field, error.code, error.message].filter(Boolean);
  return parts.join(": ") || "Unknown Traide variant update error";
}

export async function productVariantUpdate(
  id: string,
  input: TraideProductVariantUpdateInput
): Promise<{
  productVariant: ProductVariantUpdatePayload["productVariantUpdate"]["productVariant"];
  errors: string[];
}> {
  const data = await executeTraideMutation<ProductVariantUpdatePayload>("productVariantUpdate", {
    id,
    input,
  });
  const errors = (data.productVariantUpdate.productErrors ?? []).map(formatVariantError);
  return { productVariant: data.productVariantUpdate.productVariant ?? null, errors };
}
