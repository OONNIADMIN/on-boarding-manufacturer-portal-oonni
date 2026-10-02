-- Rename the category table (and its indexes/constraints) away from the old vendor name.
ALTER TABLE "traide_categories" RENAME TO "marketplace_categories";

ALTER INDEX "traide_categories_pkey" RENAME TO "marketplace_categories_pkey";
ALTER INDEX "traide_categories_nautical_id_key" RENAME TO "marketplace_categories_nautical_id_key";
ALTER INDEX "traide_categories_parent_id_idx" RENAME TO "marketplace_categories_parent_id_idx";
ALTER INDEX "traide_categories_slug_idx" RENAME TO "marketplace_categories_slug_idx";
ALTER INDEX "traide_categories_deleted_at_idx" RENAME TO "marketplace_categories_deleted_at_idx";

ALTER TABLE "marketplace_categories" RENAME CONSTRAINT "traide_categories_parent_id_fkey" TO "marketplace_categories_parent_id_fkey";
