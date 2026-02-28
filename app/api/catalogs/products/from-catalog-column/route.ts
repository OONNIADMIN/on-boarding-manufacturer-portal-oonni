import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
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

    const catalog = await prisma.catalog.findUnique({ where: { id: catalog_id } });
    if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

    const isAdmin = user.role.name === "admin";
    const isOwn = user.manufacturer_id === manufacturer_id;
    if (!isAdmin && !isOwn) return forbidden("Access denied");
    if (!catalog.catalog_file) return notFound("Catalog file not found");

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
    let created = 0;
    let skipped = 0;

    for (const sku of skus) {
      const exists = await prisma.product.findFirst({
        where: { sku, manufacturer_id, deleted_at: null },
      });
      if (exists) { skipped++; continue; }

      await prisma.product.create({
        data: { sku, manufacturer_id, catalog_id },
      });
      created++;
    }

    return ok({
      message: "Products created from catalog",
      total_skus: skus.length,
      created,
      skipped,
      catalog_id,
      manufacturer_id,
    });
  } catch (e) {
    console.error("Create products from catalog error:", e);
    return err("Failed to create products", 500);
  }
}
