-- CreateTable
CREATE TABLE "traide_categories" (
    "id" SERIAL NOT NULL,
    "nautical_id" VARCHAR(255) NOT NULL,
    "parent_id" INTEGER,
    "parent_nautical_id" VARCHAR(255),
    "name" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "metadata" JSONB,
    "custom_fields" JSONB,
    "payload" JSONB,
    "synced_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "traide_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traide_categories_nautical_id_key" ON "traide_categories"("nautical_id");

-- CreateIndex
CREATE INDEX "traide_categories_parent_id_idx" ON "traide_categories"("parent_id");

-- CreateIndex
CREATE INDEX "traide_categories_slug_idx" ON "traide_categories"("slug");

-- CreateIndex
CREATE INDEX "traide_categories_deleted_at_idx" ON "traide_categories"("deleted_at");

-- AddForeignKey
ALTER TABLE "traide_categories" ADD CONSTRAINT "traide_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "traide_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
