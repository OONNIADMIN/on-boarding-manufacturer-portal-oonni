import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import {
  catalogSpreadsheetFileName,
  fetchCatalogSpreadsheetBuffer,
} from "@/lib/catalog-file-fetch";
import { createProductsFromCatalogSpreadsheet } from "@/lib/create-products-from-catalog-spreadsheet";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const body = await req.json();
    const { catalog_id, sku_column, manufacturer_id } = body;

    if (!catalog_id || !sku_column || !manufacturer_id) {
      return err("catalog_id, sku_column and manufacturer_id are required");
    }

    const catalog = await prisma.catalog.findUnique({ where: { id: catalog_id } });
    if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

    const isAdmin = user.role.name === "admin";
    const isOwn = user.manufacturer_id === manufacturer_id;
    if (!isAdmin && !isOwn) return forbidden("Access denied");
    if (!catalog.catalog_file) return notFound("Catalog file not found");

    const buffer = await fetchCatalogSpreadsheetBuffer(catalog.catalog_file);
    const fileName = catalogSpreadsheetFileName(catalog.catalog_file);
    const headerRowIndex = catalog.header_row_index ?? 0;

    const result = await createProductsFromCatalogSpreadsheet({
      buffer,
      fileName,
      headerRowIndex,
      skuColumn: sku_column,
      catalogId: catalog_id,
      manufacturerId: manufacturer_id,
    });

    return ok({
      message: "Products created from catalog",
      ...result,
      catalog_id,
      manufacturer_id,
    });
  } catch (e) {
    console.error("Create products from catalog error:", e);
    const message =
      e instanceof Error && e.message.includes("Could not download the catalog file")
        ? e.message
        : "Failed to create products";
    return err(message, 500);
  }
}
