export const PRODUCT_IMAGE_CREATE_MUTATION = `
mutation ($input: ProductImageCreateInput!) {
  productImageCreate(input: $input) {
    product {
      id
      name
    }
    image {
      id
      sortOrder
      externalId
      externalSource
      alt
      url
    }
    productErrors {
      field
      message
      code
      attributes
    }
  }
}
`;

export type ProductImageCreatePayload = {
  productImageCreate: {
    product?: { id?: string | null; name?: string | null } | null;
    image: {
      id: string;
      sortOrder?: number | null;
      externalId?: string | null;
      externalSource?: string | null;
      alt?: string | null;
      url?: string | null;
    } | null;
    productErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
      attributes?: unknown;
    }>;
  };
};
