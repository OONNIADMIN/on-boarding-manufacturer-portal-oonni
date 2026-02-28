import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const column = searchParams.get("column") ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const catalog = await prisma.catalog.findUnique({ where: { id: parseInt(id, 10) } });
  if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

  const isAdmin = user.role.name === "admin";
  const isOwn = user.manufacturer_id === catalog.manufacturer_id;
  if (!isAdmin && !isOwn) return forbidden("Access denied");
  if (!catalog.catalog_file) return notFound("Catalog file not found");

  try {
    const res = await fetch(catalog.catalog_file);
    if (!res.ok) return err("Failed to fetch catalog file");

    const url = catalog.catalog_file.toLowerCase();
    let rows: Record<string, unknown>[] = [];

    if (url.endsWith(".csv") || url.includes("csv")) {
      const text = await res.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      rows = parsed.data;
    } else {
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    }

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
