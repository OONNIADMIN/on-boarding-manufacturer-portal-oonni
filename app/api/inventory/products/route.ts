import {
  evaluateProductCompleteness,
  hasCompletenessFilter,
  matchesCompletenessFilter,
  type CompletenessFilter,
  type CompletenessIssueKind,
  type CompletenessStatus,
} from "@/lib/inventory-completeness";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { err, ok } from "@/lib/api-response";
import { requireInventoryAdmin, requireInventoryManufacturer } from "@/lib/inventory-access";
import { getNauticalConfig } from "@/lib/nautical-client";
import { syncManufacturerInventory } from "@/lib/nautical-inventory";
import { persistInventoryAttributes } from "@/lib/inventory-attributes";
import {
  catalogForProductType,
  loadProductTypeCatalogs,
  resolveCatalogAttributes,
} from "@/lib/inventory-attribute-catalog";
import { resolveVariantImages } from "@/lib/inventory-crud";
import { inventoryOrderBy, inventorySearchOr } from "@/lib/inventory-list-query";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;
  const manufacturerId = auth.manufacturerId;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
  const skip = (page - 1) * limit;
  const search = String(searchParams.get("search") ?? "").trim();
  const sort = String(searchParams.get("sort") ?? "name").trim();
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const completenessParam = String(searchParams.get("completeness") ?? "").trim();
  const completenessStatus: CompletenessStatus | "" =
    completenessParam === "complete" ||
    completenessParam === "needs_review" ||
    completenessParam === "incomplete"
      ? completenessParam
      : "";
  const issueKinds = String(searchParams.get("issues") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is CompletenessIssueKind =>
      value === "empty" || value === "na" || value === "zero" || value === "short"
    );
  const completenessFilter: CompletenessFilter = {
    status: completenessStatus,
    issues: issueKinds,
  };
  const filterByCompleteness = hasCompletenessFilter(completenessFilter);

  const where: Prisma.InventoryProductWhereInput = {
    manufacturer_id: manufacturerId,
    deleted_at: null,
  };

  const searchOr = inventorySearchOr(search);
  if (searchOr) where.OR = searchOr;

  const orderBy = inventoryOrderBy(sort, order);

  const [counted, rows] = await Promise.all([
    filterByCompleteness ? Promise.resolve(0) : prisma.inventoryProduct.count({ where }),
    prisma.inventoryProduct.findMany({
      where,
      orderBy,
      ...(filterByCompleteness ? {} : { skip, take: limit }),
    }),
  ]);

  const productIds = rows.map((row) => row.id);
  const variants = productIds.length
    ? await prisma.inventoryVariant.findMany({
        where: { inventory_product_id: { in: productIds } },
        orderBy: [{ sku: "asc" }, { name: "asc" }],
      })
    : [];
  const variantsByProduct = new Map<number, typeof variants>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.inventory_product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.inventory_product_id, list);
  }

  const types = await loadProductTypeCatalogs();

  const scored = rows.map((row) => {
    const productVariants = variantsByProduct.get(row.id) ?? [];
    const productCatalog = catalogForProductType(types, row.product_type, "product");
    const variantCatalog = catalogForProductType(types, row.product_type, "variant");
    const attributes = resolveCatalogAttributes(row, productCatalog);
    return {
      ...row,
      attributes,
      variant_count: productVariants.length,
      completeness: evaluateProductCompleteness(
        { ...row, attributes },
        productVariants.map((variant) => {
          const storedAttrs = resolveCatalogAttributes(
            { attributes: persistInventoryAttributes(variant.attributes), payload: variant.payload },
            variantCatalog
          );
          return {
            ...variant,
            payload: null,
            images: resolveVariantImages(variant, row.payload, row.images),
            attributes: storedAttrs,
          };
        })
      ),
    };
  });
  const products = filterByCompleteness
    ? scored.filter((row) => matchesCompletenessFilter(row.completeness, completenessFilter))
    : scored;
  const total = filterByCompleteness ? products.length : counted;
  const paged = filterByCompleteness ? products.slice(skip, skip + limit) : products;

  return ok({
    products: paged,
    total,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireInventoryAdmin(req);
  if (!auth.ok) return auth.response;
  const manufacturerId = auth.manufacturerId;
  if (!manufacturerId) return err("Manufacturer ID is required", 400);

  if (!getNauticalConfig()) {
    return err("Traide integration is not configured.", 503);
  }

  try {
    const result = await syncManufacturerInventory(manufacturerId);
    return ok(result);
  } catch (e) {
    console.error("inventory sync:", e);
    const message = e instanceof Error ? e.message : "Failed to sync inventory from Traide";
    return err(message, 502);
  }
}
