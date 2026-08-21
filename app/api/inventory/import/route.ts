import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api-response";
import { requireInventoryManufacturer } from "@/lib/inventory-access";
import { clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, IMPORT_LIMIT } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  contentLengthTooLarge,
  fileTooLarge,
  rejectIfLimited,
} from "@/lib/request-limits";
import { sniffSpreadsheetKind } from "@/lib/upload-file-guard";
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
  const limited = rejectIfLimited(
    `import-inventory:${auth.userId}:${clientIp(req)}`,
    IMPORT_LIMIT,
    AUTH_WINDOW_MS
  );
  if (limited) return limited;
  if (contentLengthTooLarge(req)) return err("File exceeds 10MB limit", 413);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return err("Upload an Excel file exported from inventory");
    if (fileTooLarge(file.size)) return err("File exceeds 10MB limit", 413);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return err("The uploaded file is empty");
    if (buffer.length > MAX_UPLOAD_BYTES) return err("File exceeds 10MB limit", 413);
    if (sniffSpreadsheetKind(buffer, file.name) !== "xlsx") {
      return err("Upload an Excel .xlsx file exported from inventory");
    }
    const kind = parseKind(String(form.get("kind") ?? ""));
    const result = await importInventoryWorkbook(auth.manufacturerId, auth.userId, buffer, kind);
    return ok(result);
  } catch (e) {
    console.error("inventory import:", e);
    return err(e instanceof Error ? e.message : "Failed to import inventory", 400);
  }
}
