-- CreateTable
CREATE TABLE "catalog_import_jobs" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(40) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "manufacturer_id" INTEGER NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "header_row_index" INTEGER NOT NULL DEFAULT 0,
    "sku_column" VARCHAR(255),
    "image_columns" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(32) NOT NULL,
    "phase" VARCHAR(64) NOT NULL,
    "message" TEXT,
    "progress_current" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "catalog_id" INTEGER,
    "products_created" INTEGER NOT NULL DEFAULT 0,
    "images_created" INTEGER NOT NULL DEFAULT 0,
    "images_failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "catalog_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_import_jobs_public_id_key" ON "catalog_import_jobs"("public_id");
CREATE INDEX "catalog_import_jobs_user_id_created_at_idx" ON "catalog_import_jobs"("user_id", "created_at");
CREATE INDEX "catalog_import_jobs_manufacturer_id_status_idx" ON "catalog_import_jobs"("manufacturer_id", "status");
