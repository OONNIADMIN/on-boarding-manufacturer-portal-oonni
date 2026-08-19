/**
 * Traide/Nautical GraphQL mutations. Documents live here so operations never embed SDL.
 * productBulkCreate / productVariantBulkCreate upsert by externalId.
 */

export const PRODUCT_BULK_CREATE_MUTATION = `
mutation ($products: [ProductBulkCreateInput!]!) {
  productBulkCreate(products: $products) {
    products {
      id
      name
      externalId
      createdAt
      descriptionHtml
      description
      hasWarnings
      hasVariantOptions
      isShippingRequired
      productSource
      publicationDate
      saleMessages
    }
    bulkProductErrors {
      field
      message
      code
      attributes
      index
      warehouses
    }
  }
}
`;

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

export const TRAIDE_MUTATIONS = {
  productBulkCreate: PRODUCT_BULK_CREATE_MUTATION,
  productVariantBulkCreate: PRODUCT_VARIANT_BULK_CREATE_MUTATION,
} as const;

export type TraideMutationName = keyof typeof TRAIDE_MUTATIONS;

export type TraideBulkProductError = {
  field?: string | null;
  message?: string | null;
  code?: string | null;
  attributes?: unknown;
  index?: number | null;
  warehouses?: unknown;
};

export type ProductBulkCreatePayload = {
  productBulkCreate: {
    products: Array<{
      id: string;
      name: string;
      externalId?: string | null;
    }>;
    bulkProductErrors: TraideBulkProductError[];
  };
};

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
