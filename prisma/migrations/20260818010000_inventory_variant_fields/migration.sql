-- AlterTable
ALTER TABLE "inventory_variants" ADD COLUMN IF NOT EXISTS "sku" VARCHAR(255);
ALTER TABLE "inventory_variants" ADD COLUMN IF NOT EXISTS "seo_description" TEXT;
ALTER TABLE "inventory_variants" ADD COLUMN IF NOT EXISTS "dimensions" JSONB;
