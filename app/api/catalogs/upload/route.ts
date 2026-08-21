import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { imageKitUploadFailureMessage, uploadToImageKit } from "@/lib/imagekit";
import { created, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";
import { manufacturerImageKitCatalogsFolder } from "@/lib/manufacturer-media-path";
import {
  countDataRows,
  extractColumnNamesFromRows,
  parseSpreadsheetRows,
} from "@/lib/catalog-file-headers";
import { createProductsFromCatalogSpreadsheet } from "@/lib/create-products-from-catalog-spreadsheet";
import { clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, UPLOAD_LIMIT } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  contentLengthTooLarge,
  fileTooLarge,
  rejectIfLimited,
} from "@/lib/request-limits";
import { safeUploadFileName, sniffSpreadsheetKind, spreadsheetExt } from "@/lib/upload-file-guard";
import { parsePositiveInt } from "@/lib/inventory-access";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);
  const limited = rejectIfLimited(`upload-catalog:${user.id}:${clientIp(req)}`, UPLOAD_LIMIT, AUTH_WINDOW_MS);
  if (limited) return limited;
  if (contentLengthTooLarge(req)) return err("File exceeds 10MB limit", 413);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const manufacturerIdRaw = formData.get("manufacturer_id");
    const headerRowIndexRaw = formData.get("header_row_index");
    const skuColumnRaw = formData.get("sku_column");

    if (!file) return err("No file provided");
    if (fileTooLarge(file.size)) return err("File exceeds 10MB limit", 413);
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
    if (buffer.length > MAX_UPLOAD_BYTES) return err("File exceeds 10MB limit", 413);

    const kind = sniffSpreadsheetKind(buffer, file.name);
    if (!kind) return err("Invalid file type. Allowed: CSV, XLSX, XLS");
    const safeName = safeUploadFileName(file.name, spreadsheetExt(kind));

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer || manufacturer.deleted_at) return notFound("Manufacturer not found");

    const isAdmin = isAdminUser(user);
    const isOwn = user.manufacturer_id === manufacturerId;
    if (!isAdmin && !isOwn) return forbidden("You don't have permission to upload catalogs for this manufacturer");

    const spreadsheetRows = parseSpreadsheetRows(buffer, safeName);
    if (!spreadsheetRows.length) return err("The uploaded file is empty");
    if (headerRowIndex >= spreadsheetRows.length) {
      return err(`Header row ${headerRowIndex + 1} is outside the file (${spreadsheetRows.length} row(s) found)`);
    }

    const columnNames = extractColumnNamesFromRows(spreadsheetRows, headerRowIndex);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${timestamp}_${safeName}`;
    const folder = manufacturerImageKitCatalogsFolder(manufacturer);

    const uploaded = await uploadToImageKit(buffer, fileName, folder);

    const dataInfo = {
      rows: countDataRows(spreadsheetRows, headerRowIndex),
      columns: columnNames.length,
      column_names: columnNames,
      header_row_index: headerRowIndex,
    };

    const catalogName = safeName.replace(/\.[^.]+$/, "") || "catalog";
    let slug = slugify(catalogName);
    const base = slug;
    let i = 1;
    while (await prisma.catalog.findUnique({ where: { slug } })) slug = `${base}-${i++}`;

    const catalog = await prisma.catalog.create({
      data: {
        manufacturer_id: manufacturerId,
        name: catalogName,
        slug,
        description: `Catalog uploaded from ${safeName}`,
        catalog_file: uploaded.url,
        header_row_index: headerRowIndex,
      },
      include: { manufacturer: true },
    });

    let productsFromUpload: Awaited<ReturnType<typeof createProductsFromCatalogSpreadsheet>> | null =
      null;
    if (skuColumn) {
      productsFromUpload = await createProductsFromCatalogSpreadsheet({
        buffer,
        fileName: safeName,
        headerRowIndex,
        skuColumn,
        catalogId: catalog.id,
        manufacturerId,
      });
    }

    return created({
      ...catalog,
      message: `Catalog uploaded successfully`,
      filename: safeName,
      saved_as: uploaded.name,
      file_path: uploaded.url,
      file_size_bytes: buffer.length,
      uploaded_at: catalog.created_at,
      data_info: dataInfo,
      products_from_upload: productsFromUpload,
    });
  } catch (e) {
    console.error("Catalog upload error:", e);
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    return err("Failed to upload catalog", 500);
  }
}
