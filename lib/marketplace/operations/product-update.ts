import { executeMarketplaceMutation } from "@/lib/marketplace/graphql/client";
import type { ProductUpdatePayload, MarketplaceProductError } from "@/app/graphql";
import type { MarketplaceProductUpdateInput } from "@/lib/marketplace/mappers/product-input";

function formatProductError(error: MarketplaceProductError): string {
  const parts = [error.field, error.code, error.message].filter(Boolean);
  return parts.join(": ") || "This product could not be updated";
}

export async function productUpdate(
  id: string,
  input: MarketplaceProductUpdateInput
): Promise<{
  product: ProductUpdatePayload["productUpdate"]["product"];
  errors: string[];
}> {
  const data = await executeMarketplaceMutation<ProductUpdatePayload>("productUpdate", { id, input });
  const errors = (data.productUpdate.productErrors ?? []).map(formatProductError);
  return { product: data.productUpdate.product ?? null, errors };
}
