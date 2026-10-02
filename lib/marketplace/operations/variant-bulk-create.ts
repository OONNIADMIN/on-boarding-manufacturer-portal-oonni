import { MARKETPLACE_MUTATION_BATCH_SIZE } from "@/lib/marketplace/constants";
import { executeMarketplaceMutation } from "@/lib/marketplace/graphql/client";
import type {
  ProductVariantBulkCreatePayload,
  MarketplaceBulkProductError,
} from "@/app/graphql";
import type { MarketplaceProductVariantBulkCreateInput } from "@/lib/marketplace/mappers/variant-input";

function formatBulkError(error: MarketplaceBulkProductError, productId: string): string {
  const parts = [
    `product ${productId}`,
    error.index != null ? `variant ${error.index + 1}` : null,
    error.field,
    error.code,
    error.message,
  ].filter(Boolean);
  return parts.join(": ") || `This variant could not be published for product ${productId}`;
}

export async function productVariantBulkCreate(
  productId: string,
  variants: MarketplaceProductVariantBulkCreateInput[],
  batchSize = MARKETPLACE_MUTATION_BATCH_SIZE
): Promise<{
  productVariants: ProductVariantBulkCreatePayload["productVariantBulkCreate"]["productVariants"];
  errors: string[];
}> {
  if (!variants.length) return { productVariants: [], errors: [] };

  const productVariants: ProductVariantBulkCreatePayload["productVariantBulkCreate"]["productVariants"] =
    [];
  const errors: string[] = [];
  const step = Math.max(1, batchSize);

  for (let offset = 0; offset < variants.length; offset += step) {
    const batch = variants.slice(offset, offset + step);
    const data = await executeMarketplaceMutation<ProductVariantBulkCreatePayload>("productVariantBulkCreate", {
      product: productId,
      variants: batch,
    });
    productVariants.push(...(data.productVariantBulkCreate.productVariants ?? []));
    for (const error of data.productVariantBulkCreate.bulkProductErrors ?? []) {
      const shifted: MarketplaceBulkProductError = {
        ...error,
        index: error.index == null ? error.index : error.index + offset,
      };
      errors.push(formatBulkError(shifted, productId));
    }
  }

  return { productVariants, errors };
}
