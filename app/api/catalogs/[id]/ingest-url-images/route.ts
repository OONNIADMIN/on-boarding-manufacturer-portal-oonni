import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, requireAuth } from "@/lib/auth";
import { imageKitUploadFailureMessage, uploadToImageKit } from "@/lib/imagekit";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { manufacturerImageKitCatalogsFolder, manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";
import {
  assertHttpUrlForFetch,
  splitUrlsInCell,
  joinUrlsInCell,
  filenameFromUrl,
  normalizeMimeType,
  MAX_REMOTE_IMAGE_BYTES,
} from "@/lib/remote-image-import";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type CachedUpload = {
  url: string;
  filePath: string;
  fileId: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  originalFilename: string;
};

function isCsvCatalog(catalogFileUrl: string): boolean {
  const u = catalogFileUrl.toLowerCase();
  return u.endsWith(".csv") || u.includes(".csv");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const { id } = await params;
    const catalogId = parseInt(id, 10);
    const body = await req.json();
    const { sku_column, image_column, manufacturer_id } = body as {
      sku_column?: string;
      image_column?: string;
      manufacturer_id?: number;
    };

    if (!catalogId || !sku_column || !image_column || !manufacturer_id) {
      return err("catalog id, sku_column, image_column and manufacturer_id are required");
    }

    const catalog = await prisma.catalog.findUnique({
      where: { id: catalogId },
      include: { manufacturer: true },
    });
    if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

    const isAdmin = user.role.name.trim().toLowerCase() === "admin";
    const isOwn = effectiveManufacturerId(user) === manufacturer_id;
    if (!isAdmin && !isOwn) return forbidden("Access denied");
    if (catalog.manufacturer_id !== manufacturer_id) return forbidden("Catalog does not belong to this manufacturer");
    if (!catalog.catalog_file) return notFound("Catalog file not found");

    const fileRes = await fetch(catalog.catalog_file);
    if (!fileRes.ok) return err("Failed to fetch catalog file");

    const imagesFolder = manufacturerImageKitImagesFolder(catalog.manufacturer);
    const catalogsFolder = manufacturerImageKitCatalogsFolder(catalog.manufacturer);

    const urlMap = new Map<string, CachedUpload>();
    let imagesCreated = 0;
    let uploadFailures = 0;
    let rowsSkippedNoProduct = 0;

    async function ensureUploaded(sourceUrl: string): Promise<CachedUpload | null> {
      const existing = urlMap.get(sourceUrl);
      if (existing) return existing;
      try {
        const parsed = assertHttpUrlForFetch(sourceUrl);
        const imgRes = await fetch(parsed.toString(), {
          redirect: "follow",
          signal: AbortSignal.timeout(45_000),
          headers: { "User-Agent": "OonniCatalogImporter/1.0" },
        });
        if (!imgRes.ok) {
          console.warn("Remote image fetch failed:", sourceUrl, imgRes.status);
          uploadFailures++;
          return null;
        }
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_REMOTE_IMAGE_BYTES) {
          console.warn("Remote image size invalid:", sourceUrl, buf.length);
          uploadFailures++;
          return null;
        }
        const mime = normalizeMimeType(imgRes.headers.get("content-type"), parsed);
        if (!mime.startsWith("image/")) {
          console.warn("Remote URL is not an image:", sourceUrl, mime);
          uploadFailures++;
          return null;
        }
        const baseName = filenameFromUrl(parsed, "imported.jpg");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${stamp}_${baseName}`;
        const uploaded = await uploadToImageKit(buf, fileName, imagesFolder, mime);
        const cached: CachedUpload = {
          url: uploaded.url,
          filePath: uploaded.filePath,
          fileId: uploaded.fileId,
          fileSize: buf.length,
          mimeType: mime,
          width: uploaded.width,
          height: uploaded.height,
          originalFilename: baseName,
        };
        urlMap.set(sourceUrl, cached);
        return cached;
      } catch (e) {
        console.warn("ensureUploaded error:", sourceUrl, e);
        uploadFailures++;
        return null;
      }
    }

    const catalogUrl = catalog.catalog_file;

    if (isCsvCatalog(catalogUrl)) {
      const text = await fileRes.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      const rows = parsed.data;
      const fields = parsed.meta.fields ?? [];
      if (!fields.includes(sku_column) || !fields.includes(image_column)) {
        return err(`Columns not found in CSV. Available: ${fields.join(", ")}`);
      }

      for (const row of rows) {
        const sku = String(row[sku_column] ?? "").trim();
        const imageCellOriginal = row[image_column];
        const urls = splitUrlsInCell(imageCellOriginal);
        if (urls.length === 0) continue;

        const product =
          sku.length > 0
            ? await prisma.product.findFirst({
                where: {
                  sku,
                  manufacturer_id,
                  catalog_id: catalogId,
                  deleted_at: null,
                },
              })
            : null;

        const replacements: string[] = [];
        for (const src of urls) {
          const uploaded = await ensureUploaded(src);
          if (!uploaded) {
            replacements.push(src);
            continue;
          }
          replacements.push(uploaded.url);
          if (product) {
            await prisma.image.create({
              data: {
                manufacturer_id,
                user_id: user.id,
                product_id: product.id,
                original_filename: uploaded.originalFilename,
                s3_key: uploaded.filePath,
                s3_url: uploaded.url,
                imagekit_file_id: uploaded.fileId,
                file_size: uploaded.fileSize,
                mime_type: uploaded.mimeType,
                width: uploaded.width ?? null,
                height: uploaded.height ?? null,
                optimized: 1,
              },
            });
            imagesCreated++;
          } else {
            rowsSkippedNoProduct++;
          }
        }
        row[image_column] = joinUrlsInCell(replacements, imageCellOriginal);
      }

      const newCsv = Papa.unparse(rows, { columns: fields });
      const outBuffer = Buffer.from(newCsv, "utf8");
      const outName = `${new Date().toISOString().replace(/[:.]/g, "-")}_catalog.csv`;
      const uploadedCatalog = await uploadToImageKit(outBuffer, outName, catalogsFolder, "text/csv");
      await prisma.catalog.update({
        where: { id: catalogId },
        data: { catalog_file: uploadedCatalog.url },
      });

      return ok({
        message: "Images imported from spreadsheet URLs; catalog file updated with ImageKit URLs",
        catalog_id: catalogId,
        catalog_file: uploadedCatalog.url,
        unique_sources_fetched: urlMap.size,
        images_created: imagesCreated,
        upload_failures: uploadFailures,
        rows_missing_product: rowsSkippedNoProduct,
      });
    }

    // Excel path (first sheet only)
    const arrayBuffer = await fileRes.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
      header: 1,
      defval: "",
    });
    if (!aoa.length) return err("Spreadsheet is empty");

    const header = (aoa[0] ?? []).map((c) => String(c ?? "").trim());
    const skuIdx = header.indexOf(sku_column);
    const imgIdx = header.indexOf(image_column);
    if (skuIdx < 0 || imgIdx < 0) {
      return err(`Columns not found in Excel. Available: ${header.filter(Boolean).join(", ")}`);
    }

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      while (row.length <= Math.max(skuIdx, imgIdx)) row.push("");
      const sku = String(row[skuIdx] ?? "").trim();
      const imageCellOriginal = row[imgIdx];
      const urls = splitUrlsInCell(imageCellOriginal);

      if (urls.length === 0) continue;

      const product =
        sku.length > 0
          ? await prisma.product.findFirst({
              where: {
                sku,
                manufacturer_id,
                catalog_id: catalogId,
                deleted_at: null,
              },
            })
          : null;

      const replacements: string[] = [];
      for (const src of urls) {
        const uploaded = await ensureUploaded(src);
        if (!uploaded) {
          replacements.push(src);
          continue;
        }
        replacements.push(uploaded.url);
        if (product) {
          await prisma.image.create({
            data: {
              manufacturer_id,
              user_id: user.id,
              product_id: product.id,
              original_filename: uploaded.originalFilename,
              s3_key: uploaded.filePath,
              s3_url: uploaded.url,
              imagekit_file_id: uploaded.fileId,
              file_size: uploaded.fileSize,
              mime_type: uploaded.mimeType,
              width: uploaded.width ?? null,
              height: uploaded.height ?? null,
              optimized: 1,
            },
          });
          imagesCreated++;
        } else {
          rowsSkippedNoProduct++;
        }
      }
      row[imgIdx] = joinUrlsInCell(replacements, imageCellOriginal);
    }

    const newSheet = XLSX.utils.aoa_to_sheet(aoa);
    workbook.Sheets[sheetName] = newSheet;
    const wbout = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const outBuffer = Buffer.isBuffer(wbout) ? wbout : Buffer.from(wbout as ArrayBuffer);
    const outName = `${new Date().toISOString().replace(/[:.]/g, "-")}_catalog.xlsx`;
    const uploadedCatalog = await uploadToImageKit(
      outBuffer,
      outName,
      catalogsFolder,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await prisma.catalog.update({
      where: { id: catalogId },
      data: { catalog_file: uploadedCatalog.url },
    });

    return ok({
      message: "Images imported from spreadsheet URLs; catalog file updated with ImageKit URLs",
      catalog_id: catalogId,
      catalog_file: uploadedCatalog.url,
      unique_sources_fetched: urlMap.size,
      images_created: imagesCreated,
      upload_failures: uploadFailures,
      rows_missing_product: rowsSkippedNoProduct,
    });
  } catch (e) {
    console.error("ingest-url-images error:", e);
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    return err("Failed to import images from catalog URLs", 500);
  }
}
