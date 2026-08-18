import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, err } from "@/lib/api-response";
import { LOCAL_INVENTORY_PREFIX, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseProductInput } from "@/lib/inventory-crud";

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
      status: parsed.status,
      is_published: parsed.is_published,
      category: parsed.category,
      product_type: parsed.product_type,
      attributes: parsed.attributes,
      images: [],
      synced_at: new Date(),
    },
  });

  return created({ ...product, variant_count: 0 });
}
