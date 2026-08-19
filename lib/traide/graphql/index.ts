export {
  executeTraideMutation,
  executeTraideQuery,
  getNauticalConfig,
  nauticalGraphql,
  nauticalNotConfiguredMessage,
  type TraideConfig,
} from "./client";

export {
  TRAIDE_MUTATIONS,
  TRAIDE_QUERIES,
  type ProductBulkCreatePayload,
  type ProductUpdatePayload,
  type ProductVariantBulkCreatePayload,
  type TraideBulkProductError,
  type TraideMutationName,
  type TraideQueryName,
} from "@/app/graphql";
