export const PRODUCT_VARIANT_IMAGE_ASSIGN_MUTATION = `
mutation ($imageId: ID!, $variantId: ID!, $countryCode: CountryCode) {
  productVariantImageAssign(imageId: $imageId, variantId: $variantId) {
    productVariant {
      id
      name
      quantityAvailable(countryCode: $countryCode)
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

export type ProductVariantImageAssignPayload = {
  productVariantImageAssign: {
    productVariant: { id: string; name?: string | null } | null;
    productErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
      attributes?: unknown;
    }>;
  };
};
