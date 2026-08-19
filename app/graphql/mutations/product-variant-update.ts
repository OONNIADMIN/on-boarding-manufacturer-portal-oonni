import type { TraideProductError } from "./product-update";

export const PRODUCT_VARIANT_UPDATE_MUTATION = `
mutation ($id: ID!, $input: ProductVariantInput!) {
  productVariantUpdate(id: $id, input: $input) {
    productErrors {
      field
      message
      code
      attributes
    }
    productVariant {
      id
      name
      sku
      seoDescription
    }
  }
}
`;

export type ProductVariantUpdatePayload = {
  productVariantUpdate: {
    productVariant: {
      id: string;
      name?: string | null;
      sku?: string | null;
      seoDescription?: string | null;
    } | null;
    productErrors: TraideProductError[];
  };
};
