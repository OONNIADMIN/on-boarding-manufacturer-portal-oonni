import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { created, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, UPLOAD_LIMIT } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  contentLengthTooLarge,
  fileTooLarge,
  rejectIfLimited,
} from "@/lib/request-limits";
import { uploadTooLargeMessage } from "@/lib/upload-limits";
import { safeUploadFileName, sniffSpreadsheetKind, spreadsheetExt } from "@/lib/upload-file-guard";
import { parsePositiveInt } from "@/lib/inventory-access";
import { enqueueCatalogImport } from "@/lib/catalog-import-job";

export const maxDuration = 300;

function parseImageColumns(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((c) => String(c).trim()).filter(Boolean);
    }
  } catch {
    /* comma-separated */
  }
  return raw.split(",").map((c) => c.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);
  const limited = rejectIfLimited(`upload-catalog:${user.id}:${clientIp(req)}`, UPLOAD_LIMIT, AUTH_WINDOW_MS);
  if (limited) return limited;
  if (contentLengthTooLarge(req)) return err(uploadTooLargeMessage(), 413);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const manufacturerIdRaw = formData.get("manufacturer_id");
    const headerRowIndexRaw = formData.get("header_row_index");
    const skuColumnRaw = formData.get("sku_column");
    const imageColumns = parseImageColumns(formData.get("image_columns"));

    if (!file) return err("No file provided");
    if (fileTooLarge(file.size)) return err(uploadTooLargeMessage(), 413);
    if (!manufacturerIdRaw) return err("manufacturer_id is required");

    const manufacturerId = parsePositiveInt(String(manufacturerIdRaw), "manufacturer_id");
    if (!manufacturerId) return err("Invalid manufacturer_id");
    const headerRowIndex =
      headerRowIndexRaw == null || headerRowIndexRaw === ""
        ? 0
        : parseInt(String(headerRowIndexRaw), 10);

    if (!Number.isFinite(headerRowIndex) || headerRowIndex < 0) {
      return err("header_row_index must be a zero-based row number");
    }

    const skuColumn =
      typeof skuColumnRaw === "string" && skuColumnRaw.trim() ? skuColumnRaw.trim() : null;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (buffer.length > MAX_UPLOAD_BYTES) return err(uploadTooLargeMessage(), 413);

    const kind = sniffSpreadsheetKind(buffer, file.name);
    if (!kind) return err("Invalid file type. Allowed: CSV, XLSX, XLS");
    const safeName = safeUploadFileName(file.name, spreadsheetExt(kind));

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer || manufacturer.deleted_at) return notFound("Manufacturer not found");

    const isAdmin = isAdminUser(user);
    const isOwn = user.manufacturer_id === manufacturerId;
    if (!isAdmin && !isOwn) {
      return forbidden("You don't have permission to upload catalogs for this manufacturer");
    }

    const job = await enqueueCatalogImport({
      userId: user.id,
      manufacturerId,
      buffer,
      safeFileName: safeName,
      headerRowIndex,
      skuColumn,
      imageColumns,
    });

    return created({
      job_id: job.id,
      status: job.status,
      filename: job.filename,
      message: "File received. You can keep using the portal while we process it.",
    });
  } catch (e) {
    console.error("Catalog upload error:", e);
    return err("Failed to receive catalog file", 500);
  }
}
