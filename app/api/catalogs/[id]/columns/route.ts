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
    let columns: string[] = [];

    if (url.endsWith(".csv") || url.includes("csv")) {
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, preview: 1 });
      columns = parsed.meta.fields ?? [];
    } else {
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      columns = (rows[0] as string[]) ?? [];
    }

    return ok({ list_columns: columns });
  } catch (e) {
    console.error("Get columns error:", e);
    return err("Failed to read catalog file", 500);
  }
}
