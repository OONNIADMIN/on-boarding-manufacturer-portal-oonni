import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import {
  extractColumnNamesFromRows,
  parseSpreadsheetRows,
} from "@/lib/catalog-file-headers";
import {
  catalogSpreadsheetFileName,
  fetchCatalogSpreadsheetBuffer,
} from "@/lib/catalog-file-fetch";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const catalog = await prisma.catalog.findUnique({ where: { id: parseInt(id, 10) } });
  if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

  const isAdmin = user.role.name === "admin";
  const isOwn = user.manufacturer_id === catalog.manufacturer_id;
  if (!isAdmin && !isOwn) return forbidden("Access denied");

  if (!catalog.catalog_file) return notFound("Catalog file not found");

  try {
    const buffer = await fetchCatalogSpreadsheetBuffer(catalog.catalog_file);
    const fileName = catalogSpreadsheetFileName(catalog.catalog_file);
    const rows = parseSpreadsheetRows(buffer, fileName);
    const headerRowIndex = catalog.header_row_index ?? 0;
    const columns = extractColumnNamesFromRows(rows, headerRowIndex);

    return ok({ list_columns: columns, header_row_index: headerRowIndex });
  } catch (e) {
    console.error("Get columns error:", e);
    return err("Failed to read catalog file", 500);
  }
}
