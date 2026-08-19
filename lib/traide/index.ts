export {
  getNauticalConfig,
  nauticalGraphql,
  nauticalNotConfiguredMessage,
  executeTraideQuery,
  executeTraideMutation,
  TRAIDE_QUERIES,
  TRAIDE_MUTATIONS,
} from "./graphql";

export { TRAIDE_MUTATION_BATCH_SIZE } from "./constants";

export {
  fetchAllNauticalProductTypes,
  fetchNauticalProductTypeById,
  type NauticalProductTypeNode,
} from "./operations/product-types";

export {
  fetchCategoriesForTemplateSearch,
  flattenNauticalCategoryTree,
  type NauticalCategoryNode,
} from "./operations/categories";

export { resolveManufacturerSellerId, searchApprovedSellerId } from "./operations/sellers";

export { productBulkCreate } from "./operations/product-bulk-create";
export { productUpdate } from "./operations/product-update";
export { productVariantBulkCreate } from "./operations/variant-bulk-create";
export { productImageCreate } from "./operations/product-image-create";
export { productVariantImageAssign } from "./operations/variant-image-assign";
export { productImageBulkDelete } from "./operations/product-image-bulk-delete";

export {
  pushInventoryProductsToTraide,
  pushInventoryVariantsToTraide,
  type TraidePushResult,
} from "./services/inventory-bulk-push";

export {
  pushVariantImagesToTraide,
  pushVariantImagesForIds,
} from "./services/variant-images-push";
