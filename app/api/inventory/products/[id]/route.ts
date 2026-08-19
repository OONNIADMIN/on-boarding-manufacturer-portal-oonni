import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { err, notFound, ok } from "@/lib/api-response";
import { parsePositiveInt, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseProductInput, resolveVariantImages } from "@/lib/inventory-crud";
import { resolveInventoryAttributes } from "@/lib/inventory-attributes";
import { pushInventoryProductsToTraide } from "@/lib/traide/services/inventory-bulk-push";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function findOwnedProduct(manufacturerId: number, id: number) {
  return prisma.inventoryProduct.findFirst({
    where: { id, manufacturer_id: manufacturerId, deleted_at: null },
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
    ...product,
    attributes: resolveInventoryAttributes(product),
    variants: variants.map((variant) => ({
      ...variant,
      images: resolveVariantImages(variant, product.payload, product.images),
      attributes: resolveInventoryAttributes(variant),
    })),
    variant_count: variants.length,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const productId = parsePositiveInt(id, "product id");
  if (!productId) return err("Invalid product id");

  const existing = await findOwnedProduct(auth.manufacturerId, productId);
  if (!existing) return notFound("Product not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const parsed = parseProductInput(body, {
    requireName: true,
    fallbackName: existing.name,
    existingAttributes: existing.attributes,
  });
  if ("error" in parsed) return err(parsed.error);

  const product = await prisma.inventoryProduct.update({
    where: { id: existing.id },
    data: {
      name: parsed.name,
      slug: parsed.slug,
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
    },
  });

  const traide = await pushInventoryProductsToTraide(auth.manufacturerId, [product.id]);
  const refreshed = (await findOwnedProduct(auth.manufacturerId, product.id)) ?? product;
  const variantCount = await prisma.inventoryVariant.count({
    where: { inventory_product_id: product.id },
  });

  return ok({
    ...refreshed,
    variant_count: variantCount,
    traide_synced: traide.traide_synced,
    traide_errors: traide.traide_errors,
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const productId = parsePositiveInt(id, "product id");
  if (!productId) return err("Invalid product id");

  const existing = await findOwnedProduct(auth.manufacturerId, productId);
  if (!existing) return notFound("Product not found");

  await prisma.inventoryProduct.update({
    where: { id: existing.id },
    data: { deleted_at: new Date() },
  });

  return ok({ deleted: true, id: existing.id });
}
