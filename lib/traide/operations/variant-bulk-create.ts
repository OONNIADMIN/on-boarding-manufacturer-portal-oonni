import { TRAIDE_MUTATION_BATCH_SIZE } from "@/lib/traide/constants";
import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type {
  ProductVariantBulkCreatePayload,
  TraideBulkProductError,
} from "@/lib/traide/graphql/documents";
import type { TraideProductVariantBulkCreateInput } from "@/lib/traide/mappers/variant-input";

function formatBulkError(error: TraideBulkProductError, productId: string): string {
  const parts = [
    `product ${productId}`,
    error.index != null ? `variant ${error.index + 1}` : null,
    error.field,
    error.code,
    error.message,
  ].filter(Boolean);
  return parts.join(": ") || `Unknown Traide variant error for product ${productId}`;
}

export async function productVariantBulkCreate(
  productId: string,
  variants: TraideProductVariantBulkCreateInput[],
  batchSize = TRAIDE_MUTATION_BATCH_SIZE
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
    const data = await executeTraideMutation<ProductVariantBulkCreatePayload>("productVariantBulkCreate", {
      product: productId,
      variants: batch,
    });
    productVariants.push(...(data.productVariantBulkCreate.productVariants ?? []));
    for (const error of data.productVariantBulkCreate.bulkProductErrors ?? []) {
      const shifted: TraideBulkProductError = {
        ...error,
        index: error.index == null ? error.index : error.index + offset,
      };
      errors.push(formatBulkError(shifted, productId));
    }
  }

  return { productVariants, errors };
}
