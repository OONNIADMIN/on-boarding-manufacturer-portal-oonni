import type { TraideBulkProductError } from "./product-bulk-create";

export const PRODUCT_VARIANT_BULK_CREATE_MUTATION = `
mutation ($product: ID!, $variants: [ProductVariantBulkCreateInput!]!) {
  productVariantBulkCreate(product: $product, variants: $variants) {
    bulkProductErrors {
      field
      message
      code
      attributes
      index
    }
    productVariants {
      id
      sku
      name
      quantityAvailable
    }
  }
}
`;

export type ProductVariantBulkCreatePayload = {
  productVariantBulkCreate: {
    productVariants: Array<{
      id: string;
      sku?: string | null;
      name?: string | null;
      quantityAvailable?: number | null;
    }>;
    bulkProductErrors: TraideBulkProductError[];
  };
};
