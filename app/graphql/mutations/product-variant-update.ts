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
      seoTitle
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
      seoTitle?: string | null;
      seoDescription?: string | null;
    } | null;
    productErrors: TraideProductError[];
  };
};
