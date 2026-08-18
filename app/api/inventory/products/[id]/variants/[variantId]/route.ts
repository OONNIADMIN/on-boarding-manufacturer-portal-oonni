import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { err, notFound, ok } from "@/lib/api-response";
import { parsePositiveInt, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseVariantInput } from "@/lib/inventory-crud";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; variantId: string }> };

async function findOwnedVariant(manufacturerId: number, productId: number, variantId: number) {
  const product = await prisma.inventoryProduct.findFirst({
    where: { id: productId, manufacturer_id: manufacturerId, deleted_at: null },
    select: { id: true },
  });
  if (!product) return null;

  return prisma.inventoryVariant.findFirst({
    where: { id: variantId, inventory_product_id: product.id },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { id, variantId } = await params;
  const productId = parsePositiveInt(id, "product id");
  const parsedVariantId = parsePositiveInt(variantId, "variant id");
  if (!productId || !parsedVariantId) return err("Invalid id");

  const existing = await findOwnedVariant(auth.manufacturerId, productId, parsedVariantId);
  if (!existing) return notFound("Variant not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const parsed = parseVariantInput(body, { requireName: true, fallbackName: existing.name });
  if ("error" in parsed) return err(parsed.error);

  const variant = await prisma.inventoryVariant.update({
    where: { id: existing.id },
    data: {
      name: parsed.name,
      sku: parsed.sku,
      seo_description: parsed.seo_description,
      dimensions: parsed.dimensions,
      attributes: parsed.attributes,
    },
  });

  return ok({ variant });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { id, variantId } = await params;
  const productId = parsePositiveInt(id, "product id");
  const parsedVariantId = parsePositiveInt(variantId, "variant id");
  if (!productId || !parsedVariantId) return err("Invalid id");

  const existing = await findOwnedVariant(auth.manufacturerId, productId, parsedVariantId);
  if (!existing) return notFound("Variant not found");

  await prisma.inventoryVariant.delete({ where: { id: existing.id } });
  return ok({ deleted: true, id: existing.id });
}
