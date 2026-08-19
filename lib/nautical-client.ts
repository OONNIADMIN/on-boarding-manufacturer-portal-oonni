/**
 * Compatibility facade for Traide/Nautical GraphQL.
 * Documents, client, and operations live under lib/traide.
 */

export {
  getNauticalConfig,
  nauticalGraphql,
  nauticalNotConfiguredMessage,
} from "@/lib/traide/graphql/client";

export {
  fetchAllNauticalProductTypes,
  fetchNauticalProductTypeById,
  type NauticalProductTypeNode,
} from "@/lib/traide/operations/product-types";

export {
  fetchCategoriesForTemplateSearch,
  flattenNauticalCategoryTree,
  type NauticalCategoryNode,
} from "@/lib/traide/operations/categories";
