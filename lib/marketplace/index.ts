export {
  getNauticalConfig,
  nauticalGraphql,
  nauticalNotConfiguredMessage,
  executeMarketplaceQuery,
  executeMarketplaceMutation,
  MARKETPLACE_QUERIES,
  MARKETPLACE_MUTATIONS,
} from "./graphql";

export { MARKETPLACE_MUTATION_BATCH_SIZE } from "./constants";

export {
  fetchAllNauticalProductTypes,
  fetchNauticalProductTypeById,
  type NauticalProductTypeNode,
} from "./operations/product-types";

export {
  fetchCategoriesForTemplateSearch,
  fetchAllNauticalCategories,
  flattenNauticalCategoryTree,
  type NauticalCategoryNode,
  type NauticalCategoryRecord,
} from "./operations/categories";

export { resolveManufacturerSellerId, searchApprovedSellerId } from "./operations/sellers";
export {
  ensureMarketplaceSeller,
  provisionMarketplaceManufacturer,
  provisionMarketplaceStaffForSeller,
  splitPersonName,
} from "./operations/seller-provision";

export { productBulkCreate } from "./operations/product-bulk-create";
export { productUpdate } from "./operations/product-update";
export { productVariantBulkCreate } from "./operations/variant-bulk-create";
export { productVariantUpdate } from "./operations/product-variant-update";
export { productImageCreate } from "./operations/product-image-create";
export { productVariantImageAssign } from "./operations/variant-image-assign";
export { productImageBulkDelete } from "./operations/product-image-bulk-delete";
export { productImageReorder, orderedMarketplaceImageIds } from "./operations/product-image-reorder";

export {
  syncMarketplaceCategories,
  listStoredCategoryTree,
  type CategorySyncResult,
} from "./services/category-sync";

export {
  pushInventoryProductsToMarketplace,
  pushInventoryVariantsToMarketplace,
  type MarketplacePushResult,
} from "./services/inventory-bulk-push";

export {
  pushVariantImagesToMarketplace,
  pushVariantImagesForIds,
} from "./services/variant-images-push";
