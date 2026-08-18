-- AlterTable
ALTER TABLE "manufacturers" ADD COLUMN IF NOT EXISTS "nautical_seller_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "inventory_products" (
    "id" SERIAL NOT NULL,
    "manufacturer_id" INTEGER NOT NULL,
    "nautical_id" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "description_html" TEXT,
    "currency" VARCHAR(20),
    "seo_title" VARCHAR(500),
    "seo_description" TEXT,
    "external_id" VARCHAR(255),
    "is_digital" BOOLEAN NOT NULL DEFAULT false,
    "is_shipping_required" BOOLEAN NOT NULL DEFAULT true,
    "is_bundle" BOOLEAN NOT NULL DEFAULT false,
    "allow_seller_variants" BOOLEAN NOT NULL DEFAULT false,
    "available_for_purchase" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(80),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "has_warnings" BOOLEAN NOT NULL DEFAULT false,
    "has_variant_options" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB NOT NULL DEFAULT '[]',
    "dimensions" JSONB,
    "warnings" JSONB,
    "category" JSONB,
    "product_type" JSONB,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB,
    "synced_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_variants" (
    "id" SERIAL NOT NULL,
    "inventory_product_id" INTEGER NOT NULL,
    "nautical_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_products_manufacturer_id_nautical_id_key" ON "inventory_products"("manufacturer_id", "nautical_id");

-- CreateIndex
CREATE INDEX "inventory_products_manufacturer_id_deleted_at_idx" ON "inventory_products"("manufacturer_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variants_inventory_product_id_nautical_id_key" ON "inventory_variants"("inventory_product_id", "nautical_id");

-- CreateIndex
CREATE INDEX "inventory_variants_inventory_product_id_idx" ON "inventory_variants"("inventory_product_id");

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_variants" ADD CONSTRAINT "inventory_variants_inventory_product_id_fkey" FOREIGN KEY ("inventory_product_id") REFERENCES "inventory_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
