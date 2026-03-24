import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-response";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const body = await req.json();
    const { catalog_id, sku_column, manufacturer_id } = body;

    if (!catalog_id || !sku_column || !manufacturer_id) {
      return err("catalog_id, sku_column and manufacturer_id are required");
    }

    const isAdmin = user.role.name === "admin";
    const isOwn = user.manufacturer_id === manufacturer_id;
    if (!isAdmin && !isOwn) return forbidden("Access denied");

    const catalog = await prisma.catalog.findUnique({ where: { id: catalog_id } });
    if (!catalog || !catalog.catalog_file) return err("Catalog file not found", 404);

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

    const skus = [...new Set(rows.map((r) => String(r[sku_column] ?? "").trim()).filter(Boolean))];
    const preview = skus.slice(0, 50);
    return ok({
      message: "SKU preview",
      sku_column,
      catalog_id,
      preview_skus: preview,
      skus: preview,
      total_skus: skus.length,
      total: skus.length,
      column: sku_column,
      has_more: skus.length > 50,
    });
  } catch (e) {
    console.error("Preview SKUs error:", e);
    return err("Failed to preview SKUs", 500);
  }
}
