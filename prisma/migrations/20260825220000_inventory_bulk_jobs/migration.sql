-- CreateTable
CREATE TABLE "inventory_bulk_jobs" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(40) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "manufacturer_id" INTEGER NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "kind" VARCHAR(32),
    "status" VARCHAR(32) NOT NULL,
    "phase" VARCHAR(64) NOT NULL,
    "message" TEXT,
    "progress_current" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "inventory_bulk_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_bulk_jobs_public_id_key" ON "inventory_bulk_jobs"("public_id");
CREATE INDEX "inventory_bulk_jobs_user_id_created_at_idx" ON "inventory_bulk_jobs"("user_id", "created_at");
CREATE INDEX "inventory_bulk_jobs_manufacturer_id_status_idx" ON "inventory_bulk_jobs"("manufacturer_id", "status");
