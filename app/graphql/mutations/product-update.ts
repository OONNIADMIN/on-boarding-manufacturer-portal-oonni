export const PRODUCT_UPDATE_MUTATION = `
mutation ($id: ID!, $input: ProductInput!) {
  productUpdate(id: $id, input: $input) {
    productErrors {
      field
      message
      code
      attributes
    }
    product {
      id
      name
      slug
      externalId
    }
  }
}
`;

export type TraideProductError = {
  field?: string | null;
  message?: string | null;
  code?: string | null;
  attributes?: unknown;
};

export type ProductUpdatePayload = {
  productUpdate: {
    product: {
      id: string;
      name?: string | null;
      slug?: string | null;
      externalId?: string | null;
    } | null;
    productErrors: TraideProductError[];
  };
};
