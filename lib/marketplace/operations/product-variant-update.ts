import { executeMarketplaceMutation } from "@/lib/marketplace/graphql/client";
import type { ProductVariantUpdatePayload, MarketplaceProductError } from "@/app/graphql";
import type { MarketplaceProductVariantUpdateInput } from "@/lib/marketplace/mappers/variant-input";

function formatVariantError(error: MarketplaceProductError): string {
  const parts = [error.field, error.code, error.message].filter(Boolean);
  return parts.join(": ") || "This variant could not be updated";
}

export async function productVariantUpdate(
  id: string,
  input: MarketplaceProductVariantUpdateInput
): Promise<{
  productVariant: ProductVariantUpdatePayload["productVariantUpdate"]["productVariant"];
  errors: string[];
}> {
  const data = await executeMarketplaceMutation<ProductVariantUpdatePayload>("productVariantUpdate", {
    id,
    input,
  });
  const errors = (data.productVariantUpdate.productErrors ?? []).map(formatVariantError);
  return { productVariant: data.productVariantUpdate.productVariant ?? null, errors };
}
