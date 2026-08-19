-- AlterTable
ALTER TABLE "inventory_variants" ADD COLUMN IF NOT EXISTS "images" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "inventory_variants"
SET "images" = COALESCE("payload"->'images', '[]'::jsonb)
WHERE "payload" IS NOT NULL
  AND jsonb_typeof("payload"->'images') = 'array';
