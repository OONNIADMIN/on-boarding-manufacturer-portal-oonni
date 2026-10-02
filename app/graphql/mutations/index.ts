import {
  PRODUCT_BULK_CREATE_MUTATION,
  type ProductBulkCreatePayload,
  type MarketplaceBulkProductError,
} from "./product-bulk-create";
import {
  PRODUCT_UPDATE_MUTATION,
  type ProductUpdatePayload,
  type MarketplaceProductError,
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
import {
  PRODUCT_IMAGE_REORDER_MUTATION,
  type ProductImageReorderPayload,
} from "./product-image-reorder";
import {
  SELLER_SHELL_CREATE_MUTATION,
  type SellerShellCreatePayload,
  type MarketplaceSellerError,
} from "./seller-shell-create";
import {
  PRIVATE_METADATA_UPDATE_MUTATION,
  type PrivateMetadataUpdatePayload,
  type MarketplaceMetadataError,
} from "./private-metadata-update";
import {
  STAFF_CREATE_MUTATION,
  type StaffCreatePayload,
  type MarketplaceStaffError,
} from "./staff-create";
import {
  STAFF_UPDATE_MUTATION,
  type StaffUpdatePayload,
} from "./staff-update";
import {
  SELLER_USER_MAPPING_CREATE_MUTATION,
  type SellerUserMappingCreatePayload,
} from "./seller-user-mapping-create";
import {
  SELLER_WITH_OWNER_CREATE_MUTATION,
  type SellerWithOwnerCreatePayload,
} from "./seller-with-owner-create";
import {
  PERMISSION_GROUP_UPDATE_MUTATION,
  type PermissionGroupUpdatePayload,
} from "./permission-group-update";
import { TOKEN_CREATE_MUTATION, type TokenCreatePayload } from "./token-create";
import {
  AGREEMENT_CREATE_MUTATION,
  type AgreementCreatePayload,
  type MarketplaceAgreementError,
} from "./agreement-create";
import {
  SELLER_AGREEMENT_ASSIGN_MUTATION,
  type SellerAgreementAssignPayload,
} from "./seller-agreement-assign";
import {
  SELLER_AGREEMENT_ACKNOWLEDGE_MUTATION,
  type SellerAgreementAcknowledgePayload,
} from "./seller-agreement-acknowledge";

export {
  PRODUCT_BULK_CREATE_MUTATION,
  PRODUCT_UPDATE_MUTATION,
  PRODUCT_VARIANT_BULK_CREATE_MUTATION,
  PRODUCT_VARIANT_UPDATE_MUTATION,
  PRODUCT_IMAGE_CREATE_MUTATION,
  PRODUCT_VARIANT_IMAGE_ASSIGN_MUTATION,
  PRODUCT_IMAGE_BULK_DELETE_MUTATION,
  PRODUCT_IMAGE_REORDER_MUTATION,
  SELLER_SHELL_CREATE_MUTATION,
  PRIVATE_METADATA_UPDATE_MUTATION,
  STAFF_CREATE_MUTATION,
  STAFF_UPDATE_MUTATION,
  SELLER_USER_MAPPING_CREATE_MUTATION,
  SELLER_WITH_OWNER_CREATE_MUTATION,
  PERMISSION_GROUP_UPDATE_MUTATION,
  TOKEN_CREATE_MUTATION,
  AGREEMENT_CREATE_MUTATION,
  SELLER_AGREEMENT_ASSIGN_MUTATION,
  SELLER_AGREEMENT_ACKNOWLEDGE_MUTATION,
  type ProductBulkCreatePayload,
  type ProductUpdatePayload,
  type ProductVariantBulkCreatePayload,
  type ProductVariantUpdatePayload,
  type ProductImageCreatePayload,
  type ProductVariantImageAssignPayload,
  type ProductImageBulkDeletePayload,
  type ProductImageReorderPayload,
  type MarketplaceBulkProductError,
  type MarketplaceProductError,
  type SellerShellCreatePayload,
  type MarketplaceSellerError,
  type PrivateMetadataUpdatePayload,
  type MarketplaceMetadataError,
  type StaffCreatePayload,
  type MarketplaceStaffError,
  type StaffUpdatePayload,
  type SellerUserMappingCreatePayload,
  type SellerWithOwnerCreatePayload,
  type PermissionGroupUpdatePayload,
  type TokenCreatePayload,
  type AgreementCreatePayload,
  type MarketplaceAgreementError,
  type SellerAgreementAssignPayload,
  type SellerAgreementAcknowledgePayload,
};

export const MARKETPLACE_MUTATIONS = {
  productBulkCreate: PRODUCT_BULK_CREATE_MUTATION,
  productUpdate: PRODUCT_UPDATE_MUTATION,
  productVariantBulkCreate: PRODUCT_VARIANT_BULK_CREATE_MUTATION,
  productVariantUpdate: PRODUCT_VARIANT_UPDATE_MUTATION,
  productImageCreate: PRODUCT_IMAGE_CREATE_MUTATION,
  productVariantImageAssign: PRODUCT_VARIANT_IMAGE_ASSIGN_MUTATION,
  productImageBulkDelete: PRODUCT_IMAGE_BULK_DELETE_MUTATION,
  productImageReorder: PRODUCT_IMAGE_REORDER_MUTATION,
  sellerShellCreate: SELLER_SHELL_CREATE_MUTATION,
  privateMetadataUpdate: PRIVATE_METADATA_UPDATE_MUTATION,
  staffCreate: STAFF_CREATE_MUTATION,
  staffUpdate: STAFF_UPDATE_MUTATION,
  sellerUserMappingCreate: SELLER_USER_MAPPING_CREATE_MUTATION,
  sellerWithOwnerCreate: SELLER_WITH_OWNER_CREATE_MUTATION,
  permissionGroupUpdate: PERMISSION_GROUP_UPDATE_MUTATION,
  agreementCreate: AGREEMENT_CREATE_MUTATION,
  sellerAgreementAssign: SELLER_AGREEMENT_ASSIGN_MUTATION,
  sellerAgreementAcknowledge: SELLER_AGREEMENT_ACKNOWLEDGE_MUTATION,
} as const;

export type MarketplaceMutationName = keyof typeof MARKETPLACE_MUTATIONS;
