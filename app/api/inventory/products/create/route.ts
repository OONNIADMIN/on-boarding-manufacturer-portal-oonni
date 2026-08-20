import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, err } from "@/lib/api-response";
import { LOCAL_INVENTORY_PREFIX, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseProductInput } from "@/lib/inventory-crud";
import { resolveCategoryJson } from "@/lib/inventory-categories";
import { pushInventoryProductsToTraide } from "@/lib/traide/services/inventory-bulk-push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const parsed = parseProductInput(body, { requireName: true });
  if ("error" in parsed) return err(parsed.error);

  const category = await resolveCategoryJson({
    categoryId: parsed.category_id,
    categoryName: parsed.category_name,
  });

  const product = await prisma.inventoryProduct.create({
    data: {
      manufacturer_id: auth.manufacturerId,
      nautical_id: `${LOCAL_INVENTORY_PREFIX}${randomUUID()}`,
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description,
      seo_title: parsed.seo_title,
      seo_description: parsed.seo_description,
      external_id: parsed.external_id,
      available_for_purchase: parsed.available_for_purchase,
      status: "DRAFT",
      is_published: false,
      category,
      product_type: parsed.product_type,
      attributes: parsed.attributes,
      images: [],
      synced_at: new Date(),
    },
  });

  const traide = await pushInventoryProductsToTraide(auth.manufacturerId, [product.id]);
  const refreshed = await prisma.inventoryProduct.findFirst({
    where: { id: product.id, manufacturer_id: auth.manufacturerId, deleted_at: null },
  });

  return created({
    ...(refreshed ?? product),
    variant_count: 0,
    traide_synced: traide.traide_synced,
    traide_errors: traide.traide_errors,
  });
}
