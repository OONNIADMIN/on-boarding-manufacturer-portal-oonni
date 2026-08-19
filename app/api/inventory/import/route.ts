import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api-response";
import { requireInventoryManufacturer } from "@/lib/inventory-access";
import {
  BULK_KIND_PRODUCTS,
  BULK_KIND_VARIANTS,
  importInventoryWorkbook,
  type InventoryBulkKind,
} from "@/lib/inventory-bulk";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseKind(value: string | null): InventoryBulkKind | undefined {
  const kind = String(value ?? "").trim().toLowerCase();
  if (kind === BULK_KIND_PRODUCTS || kind === BULK_KIND_VARIANTS) return kind;
  return undefined;
}

export async function POST(req: NextRequest) {
  const auth = await requireInventoryManufacturer(req);
  if (!auth.ok) return auth.response;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return err("Upload an Excel file exported from inventory");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return err("The uploaded file is empty");
    const kind = parseKind(String(form.get("kind") ?? ""));
    const result = await importInventoryWorkbook(auth.manufacturerId, buffer, kind);
    return ok(result);
  } catch (e) {
    console.error("inventory import:", e);
    return err(e instanceof Error ? e.message : "Failed to import inventory", 400);
  }
}
