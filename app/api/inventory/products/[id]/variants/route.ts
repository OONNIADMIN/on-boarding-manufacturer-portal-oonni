import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, err, notFound, ok } from "@/lib/api-response";
import { LOCAL_INVENTORY_PREFIX, parsePositiveInt, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseVariantInput } from "@/lib/inventory-crud";
import { evaluateVariantCompleteness } from "@/lib/inventory-completeness";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function findOwnedProduct(manufacturerId: number, id: number) {
  return prisma.inventoryProduct.findFirst({
    where: { id, manufacturer_id: manufacturerId, deleted_at: null },
    select: { id: true },
  });
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const productId = parsePositiveInt(id, "product id");
  if (!productId) return err("Invalid product id");

  const product = await findOwnedProduct(auth.manufacturerId, productId);
  if (!product) return notFound("Product not found");

  const variants = await prisma.inventoryVariant.findMany({
    where: { inventory_product_id: product.id },
    orderBy: [{ sku: "asc" }, { name: "asc" }],
  });

  return ok({
    variants: variants.map((variant) => ({
      ...variant,
      completeness: evaluateVariantCompleteness(variant),
    })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const productId = parsePositiveInt(id, "product id");
  if (!productId) return err("Invalid product id");

  const product = await findOwnedProduct(auth.manufacturerId, productId);
  if (!product) return notFound("Product not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const parsed = parseVariantInput(body, { requireName: true });
  if ("error" in parsed) return err(parsed.error);

  const variant = await prisma.inventoryVariant.create({
    data: {
      inventory_product_id: product.id,
      nautical_id: `${LOCAL_INVENTORY_PREFIX}${randomUUID()}`,
      name: parsed.name,
      sku: parsed.sku,
      seo_description: parsed.seo_description,
      dimensions: parsed.dimensions,
      attributes: parsed.attributes,
    },
  });

  return created({ variant });
}
