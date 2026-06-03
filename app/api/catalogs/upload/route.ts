import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { imageKitUploadFailureMessage, uploadToImageKit } from "@/lib/imagekit";
import { created, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";
import { manufacturerImageKitCatalogsFolder } from "@/lib/manufacturer-media-path";
import {
  countDataRows,
  extractColumnNamesFromRows,
  parseSpreadsheetRows,
} from "@/lib/catalog-file-headers";
import { validateCatalogColumns } from "@/lib/catalog-column-validation";
import { getActiveCatalogColumnRules } from "@/lib/catalog-column-rules-service";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const manufacturerIdRaw = formData.get("manufacturer_id");
    const headerRowIndexRaw = formData.get("header_row_index");

    if (!file) return err("No file provided");
    if (!manufacturerIdRaw) return err("manufacturer_id is required");

    const manufacturerId = parseInt(String(manufacturerIdRaw), 10);
    const headerRowIndex =
      headerRowIndexRaw == null || headerRowIndexRaw === ""
        ? 0
        : parseInt(String(headerRowIndexRaw), 10);

    if (!Number.isFinite(headerRowIndex) || headerRowIndex < 0) {
      return err("header_row_index must be a zero-based row number");
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return err(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (buffer.length > MAX_FILE_SIZE) return err("File exceeds 10MB limit");

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer || manufacturer.deleted_at) return notFound("Manufacturer not found");

    const isAdmin = user.role.name === "admin";
    const isOwn = user.manufacturer_id === manufacturerId;
    if (!isAdmin && !isOwn) return forbidden("You don't have permission to upload catalogs for this manufacturer");

    const spreadsheetRows = parseSpreadsheetRows(buffer, file.name);
    if (!spreadsheetRows.length) return err("The uploaded file is empty");
    if (headerRowIndex >= spreadsheetRows.length) {
      return err(`Header row ${headerRowIndex + 1} is outside the file (${spreadsheetRows.length} row(s) found)`);
    }

    const columnNames = extractColumnNamesFromRows(spreadsheetRows, headerRowIndex);
    const columnRules = await getActiveCatalogColumnRules();
    const columnValidation = validateCatalogColumns(columnNames, columnRules);
    if (!columnValidation.valid) return err(columnValidation.message);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${timestamp}_${cleanName}`;
    const folder = manufacturerImageKitCatalogsFolder(manufacturer);

    const uploaded = await uploadToImageKit(buffer, fileName, folder);

    const dataInfo = {
      rows: countDataRows(spreadsheetRows, headerRowIndex),
      columns: columnNames.length,
      column_names: columnNames,
      header_row_index: headerRowIndex,
    };

    const catalogName = file.name.replace(/\.[^.]+$/, "");
    let slug = slugify(catalogName);
    const base = slug;
    let i = 1;
    while (await prisma.catalog.findUnique({ where: { slug } })) slug = `${base}-${i++}`;

    const catalog = await prisma.catalog.create({
      data: {
        manufacturer_id: manufacturerId,
        name: catalogName,
        slug,
        description: `Catalog uploaded from ${file.name}`,
        catalog_file: uploaded.url,
        header_row_index: headerRowIndex,
      },
      include: { manufacturer: true },
    });

    return created({
      ...catalog,
      message: `Catalog uploaded successfully`,
      filename: file.name,
      saved_as: uploaded.name,
      file_path: uploaded.url,
      file_size_bytes: buffer.length,
      uploaded_at: catalog.created_at,
      data_info: dataInfo,
    });
  } catch (e) {
    console.error("Catalog upload error:", e);
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    return err("Failed to upload catalog", 500);
  }
}
