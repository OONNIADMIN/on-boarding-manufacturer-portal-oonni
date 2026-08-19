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
