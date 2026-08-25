import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { parseSpreadsheetRows, rowsToObjects } from "@/lib/catalog-file-headers";
import { parseBoundedInt } from "@/lib/bounded-int";

function catalogFileLabel(catalogFileUrl: string): string {
  const pathname = catalogFileUrl.split("?")[0] ?? "catalog.csv";
  const segment = pathname.split("/").pop() ?? "catalog.csv";
  return segment.includes(".") ? segment : `${segment}.csv`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const column = searchParams.get("column") ?? "";
  const limit = parseBoundedInt(searchParams.get("limit"), 20, 1, 100);
  const offset = parseBoundedInt(searchParams.get("offset"), 0, 0, 10_000);

  const catalog = await prisma.catalog.findUnique({ where: { id: parseInt(id, 10) } });
  if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

  const isAdmin = isAdminUser(user);
  const isOwn = user.manufacturer_id === catalog.manufacturer_id;
  if (!isAdmin && !isOwn) return forbidden("Access denied");
  if (!catalog.catalog_file) return notFound("Catalog file not found");

  try {
    const res = await fetch(catalog.catalog_file);
    if (!res.ok) return err("Failed to fetch catalog file");

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = catalogFileLabel(catalog.catalog_file);
    const allRows = parseSpreadsheetRows(buffer, fileName);
    const headerRowIndex = catalog.header_row_index ?? 0;
    const rows = rowsToObjects(allRows, headerRowIndex);

    const col = column || (rows[0] ? Object.keys(rows[0])[0] : "");
    const allSkus = [...new Set(rows.map((r) => String(r[col] ?? "").trim()).filter(Boolean))];
    const total = allSkus.length;
    const paginated = allSkus.slice(offset, offset + limit);

    return ok({
      skus: paginated,
      total,
      column: col,
      limit,
      offset,
      has_more: offset + limit < total,
    });
  } catch (e) {
    console.error("Preview SKUs error:", e);
    return err("Failed to read catalog file", 500);
  }
}
