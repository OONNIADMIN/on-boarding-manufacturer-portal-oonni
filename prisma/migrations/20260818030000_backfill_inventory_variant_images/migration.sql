-- Copy variant images already stored on the parent product payload into inventory_variants.images.
UPDATE "inventory_variants" AS v
SET
  "images" = src.images,
  "payload" = CASE
    WHEN jsonb_typeof(v."payload") = 'object' THEN jsonb_set(v."payload", '{images}', src.images, true)
    ELSE v."payload"
  END
FROM (
  SELECT
    v2.id,
    elem->'images' AS images
  FROM "inventory_variants" v2
  INNER JOIN "inventory_products" p ON p.id = v2.inventory_product_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payload->'variants', '[]'::jsonb)) AS elem
  WHERE elem->>'id' = v2.nautical_id
    AND jsonb_typeof(elem->'images') = 'array'
    AND jsonb_array_length(elem->'images') > 0
) AS src
WHERE v.id = src.id;
