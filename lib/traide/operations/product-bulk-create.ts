import { TRAIDE_MUTATION_BATCH_SIZE } from "@/lib/traide/constants";
import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductBulkCreatePayload, TraideBulkProductError } from "@/app/graphql";
import type { TraideProductBulkCreateInput } from "@/lib/traide/mappers/product-input";

function formatBulkError(error: TraideBulkProductError): string {
  const parts = [
    error.index != null ? `item ${error.index + 1}` : null,
    error.field,
    error.code,
    error.message,
  ].filter(Boolean);
  return parts.join(": ") || "This product could not be published";
}

export async function productBulkCreate(
  products: TraideProductBulkCreateInput[],
  batchSize = TRAIDE_MUTATION_BATCH_SIZE
): Promise<{
  products: ProductBulkCreatePayload["productBulkCreate"]["products"];
  errors: string[];
}> {
  const created: ProductBulkCreatePayload["productBulkCreate"]["products"] = [];
  const errors: string[] = [];
  const step = Math.max(1, batchSize);

  for (let offset = 0; offset < products.length; offset += step) {
    const batch = products.slice(offset, offset + step);
    const data = await executeTraideMutation<ProductBulkCreatePayload>("productBulkCreate", {
      products: batch,
    });
    created.push(...(data.productBulkCreate.products ?? []));
    for (const error of data.productBulkCreate.bulkProductErrors ?? []) {
      const shifted: TraideBulkProductError = {
        ...error,
        index: error.index == null ? error.index : error.index + offset,
      };
      errors.push(formatBulkError(shifted));
    }
  }

  return { products: created, errors };
}
