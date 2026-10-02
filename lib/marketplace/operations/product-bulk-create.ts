import { MARKETPLACE_MUTATION_BATCH_SIZE } from "@/lib/marketplace/constants";
import { executeMarketplaceMutation } from "@/lib/marketplace/graphql/client";
import type { ProductBulkCreatePayload, MarketplaceBulkProductError } from "@/app/graphql";
import type { MarketplaceProductBulkCreateInput } from "@/lib/marketplace/mappers/product-input";

function formatBulkError(error: MarketplaceBulkProductError): string {
  const parts = [
    error.index != null ? `item ${error.index + 1}` : null,
    error.field,
    error.code,
    error.message,
  ].filter(Boolean);
  return parts.join(": ") || "This product could not be published";
}

export async function productBulkCreate(
  products: MarketplaceProductBulkCreateInput[],
  batchSize = MARKETPLACE_MUTATION_BATCH_SIZE
): Promise<{
  products: ProductBulkCreatePayload["productBulkCreate"]["products"];
  errors: string[];
}> {
  const created: ProductBulkCreatePayload["productBulkCreate"]["products"] = [];
  const errors: string[] = [];
  const step = Math.max(1, batchSize);

  for (let offset = 0; offset < products.length; offset += step) {
    const batch = products.slice(offset, offset + step);
    const data = await executeMarketplaceMutation<ProductBulkCreatePayload>("productBulkCreate", {
      products: batch,
    });
    created.push(...(data.productBulkCreate.products ?? []));
    for (const error of data.productBulkCreate.bulkProductErrors ?? []) {
      const shifted: MarketplaceBulkProductError = {
        ...error,
        index: error.index == null ? error.index : error.index + offset,
      };
      errors.push(formatBulkError(shifted));
    }
  }

  return { products: created, errors };
}
