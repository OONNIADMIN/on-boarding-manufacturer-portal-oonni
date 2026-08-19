import { NextRequest, NextResponse } from "next/server";
import { err } from "@/lib/api-response";
import { requireInventoryManufacturer } from "@/lib/inventory-access";
import {
  BULK_KIND_PRODUCTS,
  BULK_KIND_VARIANTS,
  exportInventoryWorkbook,
  parseCompletenessQuery,
  type InventoryBulkKind,
} from "@/lib/inventory-bulk";

export const dynamic = "force-dynamic";

function parseKind(value: string | null): InventoryBulkKind | null {
  const kind = String(value ?? "").trim().toLowerCase();
  if (kind === BULK_KIND_PRODUCTS || kind === BULK_KIND_VARIANTS) return kind;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const kind = parseKind(searchParams.get("kind"));
  if (!kind) return err('kind must be "products" or "variants"');

  try {
    const { buffer, filename } = await exportInventoryWorkbook(
      auth.manufacturerId,
      kind,
      parseCompletenessQuery(searchParams)
    );
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("inventory export:", e);
    return err(e instanceof Error ? e.message : "Failed to export inventory", 500);
  }
}
