export const PRODUCT_IMAGE_BULK_DELETE_MUTATION = `
mutation ($ids: [ID!]!) {
  productImageBulkDelete(ids: $ids) {
    count
    productErrors {
      field
      message
      code
      attributes
    }
  }
}
`;

export type ProductImageBulkDeletePayload = {
  productImageBulkDelete: {
    count?: number | null;
    productErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
      attributes?: unknown;
    }>;
  };
};
