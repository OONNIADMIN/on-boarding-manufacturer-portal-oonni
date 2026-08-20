import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductUpdatePayload, TraideProductError } from "@/app/graphql";
import type { TraideProductUpdateInput } from "@/lib/traide/mappers/product-input";

function formatProductError(error: TraideProductError): string {
  const parts = [error.field, error.code, error.message].filter(Boolean);
  return parts.join(": ") || "This product could not be updated";
}

export async function productUpdate(
  id: string,
  input: TraideProductUpdateInput
): Promise<{
  product: ProductUpdatePayload["productUpdate"]["product"];
  errors: string[];
}> {
  const data = await executeTraideMutation<ProductUpdatePayload>("productUpdate", { id, input });
  const errors = (data.productUpdate.productErrors ?? []).map(formatProductError);
  return { product: data.productUpdate.product ?? null, errors };
}
