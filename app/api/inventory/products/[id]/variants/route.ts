import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, err, notFound, ok } from "@/lib/api-response";
import { LOCAL_INVENTORY_PREFIX, parsePositiveInt, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseVariantInput, resolveVariantImages, normalizeInventoryImages } from "@/lib/inventory-crud";
import { persistInventoryAttributes } from "@/lib/inventory-attributes";
import { evaluateVariantCompleteness } from "@/lib/inventory-completeness";
import { ensureVariantImagesInImageKit } from "@/lib/inventory-variant-dam";
import { pushInventoryVariantsToTraide } from "@/lib/traide/services/inventory-bulk-push";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function findOwnedProduct(manufacturerId: number, id: number) {
  return prisma.inventoryProduct.findFirst({
    where: { id, manufacturer_id: manufacturerId, deleted_at: null },
    select: { id: true, payload: true, images: true },
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

  const storedRows = variants.length
    ? await prisma.$queryRawUnsafe<Array<{ id: number; images: unknown; attributes: unknown }>>(
        `SELECT id, images, attributes FROM inventory_variants WHERE inventory_product_id = $1`,
        product.id
      )
    : [];
  const storedById = new Map(
    storedRows.map((row) => [
      Number(row.id),
      {
        images: normalizeInventoryImages(row.images),
        attributes: row.attributes,
      },
    ])
  );

  return ok({
    variants: variants.map((variant) => {
      const stored = storedById.get(variant.id);
      const images = resolveVariantImages(
        { ...variant, images: stored?.images ?? variant.images },
        product.payload,
        product.images,
        { includeProductFallback: false }
      );
      const attributes = persistInventoryAttributes(stored?.attributes ?? variant.attributes);
      const scored = { ...variant, payload: null, images, attributes };
      return {
        ...variant,
        images,
        attributes,
        completeness: evaluateVariantCompleteness(scored),
      };
    }),
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

  const dam = await ensureVariantImagesInImageKit({
    manufacturerId: auth.manufacturerId,
    userId: auth.userId,
    images: parsed.images,
  });
  if (dam.errors.length && !dam.images.length) {
    return err(dam.errors[0] ?? "Failed to upload images to ImageKit");
  }

  const variant = await prisma.inventoryVariant.create({
    data: {
      inventory_product_id: product.id,
      nautical_id: `${LOCAL_INVENTORY_PREFIX}${randomUUID()}`,
      name: parsed.name,
      sku: parsed.sku,
      seo_description: parsed.seo_description,
      dimensions: parsed.dimensions,
      attributes: parsed.attributes,
      images: dam.images,
    },
  });

  const traide = await pushInventoryVariantsToTraide(auth.manufacturerId, [variant.id]);
  const refreshed = (await prisma.inventoryVariant.findFirst({ where: { id: variant.id } })) ?? variant;

  return created({
    variant: refreshed,
    traide_synced: traide.traide_synced,
    traide_errors: [...dam.errors, ...traide.traide_errors],
  });
}
