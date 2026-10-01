import { APPROVED_SELLERS_QUERY } from "./approved-sellers";
import { CATEGORIES_FOR_TEMPLATE_QUERY, GET_ALL_CATEGORIES_QUERY } from "./categories";
import { INVENTORY_PRODUCTS_QUERY } from "./inventory-products";
import { PRODUCT_TYPE_BY_ID_QUERY } from "./product-type-by-id";
import { PRODUCT_TYPES_PAGE_QUERY } from "./product-types";
import { SELLER_STAFF_USERS_QUERY, type SellerStaffUsersPayload } from "./seller-staff-users";
import { PERMISSION_GROUPS_QUERY, type PermissionGroupsPayload } from "./permission-groups";
import { AGREEMENT_BY_SLUG_QUERY, type AgreementBySlugPayload } from "./agreement-by-slug";
import {
  SELLER_AGREEMENT_STATE_QUERY,
  type SellerAgreementStatePayload,
} from "./seller-agreement-state";
import {
  MARKETPLACE_ME_SELLER_QUERY,
  type MarketplaceMeSellerPayload,
} from "./marketplace-me-seller";

export {
  APPROVED_SELLERS_QUERY,
  CATEGORIES_FOR_TEMPLATE_QUERY,
  GET_ALL_CATEGORIES_QUERY,
  INVENTORY_PRODUCTS_QUERY,
  PRODUCT_TYPE_BY_ID_QUERY,
  PRODUCT_TYPES_PAGE_QUERY,
  SELLER_STAFF_USERS_QUERY,
  PERMISSION_GROUPS_QUERY,
  AGREEMENT_BY_SLUG_QUERY,
  SELLER_AGREEMENT_STATE_QUERY,
  MARKETPLACE_ME_SELLER_QUERY,
  type SellerStaffUsersPayload,
  type PermissionGroupsPayload,
  type AgreementBySlugPayload,
  type SellerAgreementStatePayload,
  type MarketplaceMeSellerPayload,
};

export const MARKETPLACE_QUERIES = {
  inventoryProducts: INVENTORY_PRODUCTS_QUERY,
  approvedSellers: APPROVED_SELLERS_QUERY,
  productTypesPage: PRODUCT_TYPES_PAGE_QUERY,
  productTypeById: PRODUCT_TYPE_BY_ID_QUERY,
  categoriesForTemplate: CATEGORIES_FOR_TEMPLATE_QUERY,
  allCategories: GET_ALL_CATEGORIES_QUERY,
  sellerStaffUsers: SELLER_STAFF_USERS_QUERY,
  permissionGroups: PERMISSION_GROUPS_QUERY,
  agreementBySlug: AGREEMENT_BY_SLUG_QUERY,
  sellerAgreementState: SELLER_AGREEMENT_STATE_QUERY,
  marketplaceMeSeller: MARKETPLACE_ME_SELLER_QUERY,
} as const;

export type MarketplaceQueryName = keyof typeof MARKETPLACE_QUERIES;
