export {
  executeMarketplaceMutation,
  executeMarketplaceQuery,
  getNauticalConfig,
  nauticalGraphql,
  nauticalNotConfiguredMessage,
  type MarketplaceConfig,
} from "./client";

export {
  MARKETPLACE_MUTATIONS,
  MARKETPLACE_QUERIES,
  type ProductBulkCreatePayload,
  type ProductUpdatePayload,
  type ProductVariantBulkCreatePayload,
  type ProductVariantUpdatePayload,
  type MarketplaceBulkProductError,
  type MarketplaceMutationName,
  type MarketplaceQueryName,
} from "@/app/graphql";
