import {
  PRODUCT_BULK_CREATE_MUTATION,
  type ProductBulkCreatePayload,
  type TraideBulkProductError,
} from "./product-bulk-create";
import {
  PRODUCT_UPDATE_MUTATION,
  type ProductUpdatePayload,
  type TraideProductError,
} from "./product-update";
import {
  PRODUCT_VARIANT_BULK_CREATE_MUTATION,
  type ProductVariantBulkCreatePayload,
} from "./product-variant-bulk-create";

export {
  PRODUCT_BULK_CREATE_MUTATION,
  PRODUCT_UPDATE_MUTATION,
  PRODUCT_VARIANT_BULK_CREATE_MUTATION,
  type ProductBulkCreatePayload,
  type ProductUpdatePayload,
  type ProductVariantBulkCreatePayload,
  type TraideBulkProductError,
  type TraideProductError,
};

export const TRAIDE_MUTATIONS = {
  productBulkCreate: PRODUCT_BULK_CREATE_MUTATION,
  productUpdate: PRODUCT_UPDATE_MUTATION,
  productVariantBulkCreate: PRODUCT_VARIANT_BULK_CREATE_MUTATION,
} as const;

export type TraideMutationName = keyof typeof TRAIDE_MUTATIONS;
