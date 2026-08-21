import { APPROVED_SELLERS_QUERY } from "./approved-sellers";
import { CATEGORIES_FOR_TEMPLATE_QUERY, GET_ALL_CATEGORIES_QUERY } from "./categories";
import { INVENTORY_PRODUCTS_QUERY } from "./inventory-products";
import { PRODUCT_TYPE_BY_ID_QUERY } from "./product-type-by-id";
import { PRODUCT_TYPES_PAGE_QUERY } from "./product-types";

export {
  APPROVED_SELLERS_QUERY,
  CATEGORIES_FOR_TEMPLATE_QUERY,
  GET_ALL_CATEGORIES_QUERY,
  INVENTORY_PRODUCTS_QUERY,
  PRODUCT_TYPE_BY_ID_QUERY,
  PRODUCT_TYPES_PAGE_QUERY,
};

export const TRAIDE_QUERIES = {
  inventoryProducts: INVENTORY_PRODUCTS_QUERY,
  approvedSellers: APPROVED_SELLERS_QUERY,
  productTypesPage: PRODUCT_TYPES_PAGE_QUERY,
  productTypeById: PRODUCT_TYPE_BY_ID_QUERY,
  categoriesForTemplate: CATEGORIES_FOR_TEMPLATE_QUERY,
  allCategories: GET_ALL_CATEGORIES_QUERY,
} as const;

export type TraideQueryName = keyof typeof TRAIDE_QUERIES;
