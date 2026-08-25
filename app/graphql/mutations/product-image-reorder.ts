export const PRODUCT_IMAGE_REORDER_MUTATION = `
mutation ($productId: ID!, $imagesIds: [ID!]!) {
  productImageReorder(productId: $productId, imagesIds: $imagesIds) {
    productErrors {
      field
      message
      code
      attributes
    }
    images {
      id
      url
      sortOrder
    }
  }
}
`;

export type ProductImageReorderPayload = {
  productImageReorder: {
    productErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
      attributes?: unknown;
    }>;
    images: Array<{
      id: string;
      url?: string | null;
      sortOrder?: number | null;
    }> | null;
  };
};
