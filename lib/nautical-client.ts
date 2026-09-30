/**
 * Compatibility facade for Marketplace/Nautical GraphQL.
 * Documents, client, and operations live under lib/marketplace.
 */

export {
  getNauticalConfig,
  nauticalGraphql,
  nauticalNotConfiguredMessage,
} from "@/lib/marketplace/graphql/client";

export {
  fetchAllNauticalProductTypes,
  fetchNauticalProductTypeById,
  type NauticalProductTypeNode,
} from "@/lib/marketplace/operations/product-types";

export {
  fetchCategoriesForTemplateSearch,
  fetchAllNauticalCategories,
  flattenNauticalCategoryTree,
  type NauticalCategoryNode,
} from "@/lib/marketplace/operations/categories";
