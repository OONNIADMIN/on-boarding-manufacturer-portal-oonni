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
import {
  PRODUCT_VARIANT_UPDATE_MUTATION,
  type ProductVariantUpdatePayload,
} from "./product-variant-update";
import {
  PRODUCT_IMAGE_CREATE_MUTATION,
  type ProductImageCreatePayload,
} from "./product-image-create";
import {
  PRODUCT_VARIANT_IMAGE_ASSIGN_MUTATION,
  type ProductVariantImageAssignPayload,
} from "./product-variant-image-assign";
import {
  PRODUCT_IMAGE_BULK_DELETE_MUTATION,
  type ProductImageBulkDeletePayload,
} from "./product-image-bulk-delete";

export {
  PRODUCT_BULK_CREATE_MUTATION,
  PRODUCT_UPDATE_MUTATION,
  PRODUCT_VARIANT_BULK_CREATE_MUTATION,
  PRODUCT_VARIANT_UPDATE_MUTATION,
  PRODUCT_IMAGE_CREATE_MUTATION,
  PRODUCT_VARIANT_IMAGE_ASSIGN_MUTATION,
  PRODUCT_IMAGE_BULK_DELETE_MUTATION,
  type ProductBulkCreatePayload,
  type ProductUpdatePayload,
  type ProductVariantBulkCreatePayload,
  type ProductVariantUpdatePayload,
  type ProductImageCreatePayload,
  type ProductVariantImageAssignPayload,
  type ProductImageBulkDeletePayload,
  type TraideBulkProductError,
  type TraideProductError,
};

export const TRAIDE_MUTATIONS = {
  productBulkCreate: PRODUCT_BULK_CREATE_MUTATION,
  productUpdate: PRODUCT_UPDATE_MUTATION,
  productVariantBulkCreate: PRODUCT_VARIANT_BULK_CREATE_MUTATION,
  productVariantUpdate: PRODUCT_VARIANT_UPDATE_MUTATION,
  productImageCreate: PRODUCT_IMAGE_CREATE_MUTATION,
  productVariantImageAssign: PRODUCT_VARIANT_IMAGE_ASSIGN_MUTATION,
  productImageBulkDelete: PRODUCT_IMAGE_BULK_DELETE_MUTATION,
} as const;

export type TraideMutationName = keyof typeof TRAIDE_MUTATIONS;
