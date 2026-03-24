import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { imageKitUploadFailureMessage, uploadToImageKit } from "@/lib/imagekit";
import { created, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";
import { manufacturerImageKitCatalogsFolder } from "@/lib/manufacturer-media-path";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const manufacturerIdRaw = formData.get("manufacturer_id");

    if (!file) return err("No file provided");
    if (!manufacturerIdRaw) return err("manufacturer_id is required");

    const manufacturerId = parseInt(String(manufacturerIdRaw), 10);

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

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${timestamp}_${cleanName}`;
    const folder = manufacturerImageKitCatalogsFolder(manufacturer);

    const uploaded = await uploadToImageKit(buffer, fileName, folder);

    let dataInfo = { rows: 0, columns: 0, column_names: [] as string[] };
    try {
      if (ext === ".csv") {
        const text = buffer.toString("utf8");
        const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
        dataInfo = {
          rows: parsed.data.length,
          columns: (parsed.meta.fields ?? []).length,
          column_names: parsed.meta.fields ?? [],
        };
      } else {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rowObjects = XLSX.utils.sheet_to_json(sheet, { defval: null });
        const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        const names = ((headerRow[0] as string[]) ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
        dataInfo = {
          rows: rowObjects.length,
          columns: names.length,
          column_names: names.length ? names : Object.keys((rowObjects[0] as object) ?? {}),
        };
      }
    } catch (parseErr) {
      console.warn("Catalog column preview parse failed:", parseErr);
    }

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
