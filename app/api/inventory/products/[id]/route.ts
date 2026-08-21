import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { err, notFound, ok } from "@/lib/api-response";
import { parsePositiveInt, requireInventoryManufacturer } from "@/lib/inventory-access";
import { parseProductInput, resolveVariantImages } from "@/lib/inventory-crud";
import {
  catalogForProductType,
  loadProductTypeCatalogs,
  resolveCatalogAttributes,
} from "@/lib/inventory-attribute-catalog";
import { resolveCategoryJson } from "@/lib/inventory-categories";
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

  const types = await loadProductTypeCatalogs();
  const productCatalog = catalogForProductType(types, product.product_type, "product");
  const variantCatalog = catalogForProductType(types, product.product_type, "variant");

  return ok({
    ...product,
    attributes: resolveCatalogAttributes(product, productCatalog),
    variants: variants.map((variant) => ({
      ...variant,
      images: resolveVariantImages(variant, product.payload, product.images, {
        includeProductFallback: false,
      }),
      attributes: resolveCatalogAttributes(variant, variantCatalog),
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

  const types = await loadProductTypeCatalogs();
  const productCatalog = catalogForProductType(types, existing.product_type, "product");
  const existingAttributes = resolveCatalogAttributes(existing, productCatalog);

  const parsed = parseProductInput(body, {
    requireName: true,
    fallbackName: existing.name,
    existingAttributes,
    existingProductType: existing.product_type,
  });
  if ("error" in parsed) return err(parsed.error);

  const category = await resolveCategoryJson({
    categoryId: parsed.category_id,
    categoryName: parsed.category_name,
    existing: existing.category,
  });

  const product = await prisma.inventoryProduct.update({
    where: { id: existing.id },
    data: {
      name: parsed.name,
      description: parsed.description,
      seo_title: parsed.seo_title,
      seo_description: parsed.seo_description,
      available_for_purchase: parsed.available_for_purchase,
      category,
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
