-- CreateTable
CREATE TABLE "catalog_column_rules" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "candidates" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_column_rules_pkey" PRIMARY KEY ("id")
);

INSERT INTO "catalog_column_rules" ("label", "candidates", "sort_order", "is_active") VALUES
  ('sku', '["sku"]', 0, true),
  ('images', '["images","image","image url","image urls","image_url"]', 1, true),
  ('description', '["description","product description","product_description"]', 2, true),
  ('category', '["category"]', 3, true),
  ('title or name or product name', '["title","name","product name","product_name"]', 4, true),
  ('size', '["size"]', 5, true),
  ('color', '["color","colour"]', 6, true),
  ('width', '["width","product width"]', 7, true),
  ('height', '["height","product height"]', 8, true),
  ('length or depth', '["length","depth","product length","product depth"]', 9, true);
