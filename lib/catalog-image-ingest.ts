import { prisma } from "@/lib/db";
import type { Manufacturer } from "@prisma/client";
import {
  canonicalImageKitUrl,
  deleteFromImageKit,
  listImageKitFilesInFolder,
  uploadToImageKit,
} from "@/lib/imagekit";
import { manufacturerImageKitCatalogsFolder, manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";
import {
  assertHttpUrlForFetch,
  splitUrlsInCell,
  joinUrlsInCell,
  filenameFromUrl,
  normalizeMimeType,
  MAX_REMOTE_IMAGE_BYTES,
} from "@/lib/remote-image-import";
import { extractColumnNamesFromRows, parseSpreadsheetRows } from "@/lib/catalog-file-headers";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const IMPORT_IMAGE_PRE_TRANSFORM = "w-1600,h-1600,c-at_max,q-80";

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

export type CatalogImageIngestProgress = {
  phase: "uploading" | "finalizing";
  processed: number;
  total: number;
  uploaded: number;
  failed: number;
  images_created: number;
};

export type CatalogImageIngestResult = {
  message: string;
  catalog_id: number;
  catalog_file: string;
  unique_sources_fetched: number;
  images_created: number;
  upload_failures: number;
  rows_missing_product: number;
};

type IngestContext = {
  catalogId: number;
  manufacturerId: number;
  userId: number;
  imagesFolder: string;
  catalogsFolder: string;
  previousCatalogUrl: string;
  onProgress?: (progress: CatalogImageIngestProgress) => void;
};

function countUniqueImageUrls(
  aoa: string[][],
  headerRowIndex: number,
  imgIdx: number
): number {
  const urls = new Set<string>();
  for (let r = headerRowIndex + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    for (const src of splitUrlsInCell(row[imgIdx])) {
      urls.add(src);
    }
  }
  return urls.size;
}

async function deletePreviousCatalogFileFromImageKit(params: {
  previousCatalogUrl: string | null;
  newCatalogUrl: string;
  catalogsFolder: string;
}): Promise<void> {
  const prev = params.previousCatalogUrl?.trim();
  if (!prev) return;
  const prevCanonical = canonicalImageKitUrl(prev);
  const newCanonical = canonicalImageKitUrl(params.newCatalogUrl);
  if (prevCanonical === newCanonical) return;

  try {
    let skip = 0;
    const limit = 1000;
    for (;;) {
      const files = await listImageKitFilesInFolder({
        folderPath: params.catalogsFolder,
        fileTypeFilter: "all",
        limit,
        skip,
      });
      const match = files.find((f) => canonicalImageKitUrl(f.url) === prevCanonical);
      if (match?.fileId) {
        await deleteFromImageKit(match.fileId);
        return;
      }
      if (files.length < limit) return;
      skip += limit;
    }
  } catch (e) {
    console.warn("Failed to delete previous catalog file from ImageKit:", e);
  }
}

async function processSpreadsheetRows(
  aoa: string[][],
  headerRowIndex: number,
  skuIdx: number,
  imgIdx: number,
  ctx: IngestContext
): Promise<CatalogImageIngestResult> {
  const urlMap = new Map<string, CachedUpload>();
  let imagesCreated = 0;
  let uploadFailures = 0;
  let rowsSkippedNoProduct = 0;

  const totalUnique = countUniqueImageUrls(aoa, headerRowIndex, imgIdx);
  let processedUnique = 0;
  let uploadedUnique = 0;

  const emitProgress = (phase: CatalogImageIngestProgress["phase"]) => {
    ctx.onProgress?.({
      phase,
      processed: processedUnique,
      total: totalUnique,
      uploaded: uploadedUnique,
      failed: uploadFailures,
      images_created: imagesCreated,
    });
  };

  emitProgress("uploading");

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
        processedUnique++;
        emitProgress("uploading");
        return null;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_REMOTE_IMAGE_BYTES) {
        console.warn("Remote image size invalid:", sourceUrl, buf.length);
        uploadFailures++;
        processedUnique++;
        emitProgress("uploading");
        return null;
      }
      const mime = normalizeMimeType(imgRes.headers.get("content-type"), parsed);
      if (!mime.startsWith("image/")) {
        console.warn("Remote URL is not an image:", sourceUrl, mime);
        uploadFailures++;
        processedUnique++;
        emitProgress("uploading");
        return null;
      }
      const baseName = filenameFromUrl(parsed, "imported.jpg");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${stamp}_${baseName}`;
      const uploaded = await uploadToImageKit(buf, fileName, ctx.imagesFolder, mime, {
        preTransform: IMPORT_IMAGE_PRE_TRANSFORM,
      });
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
      uploadedUnique++;
      processedUnique++;
      emitProgress("uploading");
      return cached;
    } catch (e) {
      console.warn("ensureUploaded error:", sourceUrl, e);
      uploadFailures++;
      processedUnique++;
      emitProgress("uploading");
      return null;
    }
  }

  for (let r = headerRowIndex + 1; r < aoa.length; r++) {
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
              manufacturer_id: ctx.manufacturerId,
              catalog_id: ctx.catalogId,
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
            manufacturer_id: ctx.manufacturerId,
            user_id: ctx.userId,
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

  emitProgress("finalizing");

  return {
    message: "Images imported from spreadsheet URLs; catalog file updated with ImageKit URLs",
    catalog_id: ctx.catalogId,
    catalog_file: ctx.previousCatalogUrl,
    unique_sources_fetched: urlMap.size,
    images_created: imagesCreated,
    upload_failures: uploadFailures,
    rows_missing_product: rowsSkippedNoProduct,
  };
}

export async function ingestCatalogImagesFromSpreadsheet(params: {
  catalogId: number;
  manufacturerId: number;
  userId: number;
  skuColumn: string;
  imageColumn: string;
  catalogFileUrl: string;
  headerRowIndex: number;
  spreadsheetBuffer: Buffer;
  manufacturer: Manufacturer;
  onProgress?: (progress: CatalogImageIngestProgress) => void;
}): Promise<CatalogImageIngestResult> {
  const imagesFolder = manufacturerImageKitImagesFolder(params.manufacturer);
  const catalogsFolder = manufacturerImageKitCatalogsFolder(params.manufacturer);
  const isCsv =
    params.catalogFileUrl.toLowerCase().endsWith(".csv") ||
    params.catalogFileUrl.toLowerCase().includes(".csv");

  const aoa = parseSpreadsheetRows(
    params.spreadsheetBuffer,
    isCsv ? "catalog.csv" : "catalog.xlsx"
  );

  if (!aoa.length) throw new Error("Spreadsheet is empty");

  const header = extractColumnNamesFromRows(aoa, params.headerRowIndex);
  const skuIdx = header.indexOf(params.skuColumn);
  const imgIdx = header.indexOf(params.imageColumn);
  if (skuIdx < 0 || imgIdx < 0) {
    throw new Error(
      `Columns not found. Available: ${header.filter(Boolean).join(", ")}`
    );
  }

  const ctx: IngestContext = {
    catalogId: params.catalogId,
    manufacturerId: params.manufacturerId,
    userId: params.userId,
    imagesFolder,
    catalogsFolder,
    previousCatalogUrl: params.catalogFileUrl,
    onProgress: params.onProgress,
  };

  const partial = await processSpreadsheetRows(
    aoa,
    params.headerRowIndex,
    skuIdx,
    imgIdx,
    ctx
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (isCsv) {
    const newCsv = Papa.unparse(aoa);
    const outBuffer = Buffer.from(newCsv, "utf8");
    const uploadedCatalog = await uploadToImageKit(
      outBuffer,
      `${stamp}_catalog.csv`,
      catalogsFolder,
      "text/csv"
    );
    await prisma.catalog.update({
      where: { id: params.catalogId },
      data: { catalog_file: uploadedCatalog.url },
    });
    await deletePreviousCatalogFileFromImageKit({
      previousCatalogUrl: params.catalogFileUrl,
      newCatalogUrl: uploadedCatalog.url,
      catalogsFolder,
    });
    return { ...partial, catalog_file: uploadedCatalog.url };
  }

  const workbook = XLSX.read(params.spreadsheetBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(aoa);
  const wbout = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const outBuffer = Buffer.isBuffer(wbout) ? wbout : Buffer.from(wbout as ArrayBuffer);
  const uploadedCatalog = await uploadToImageKit(
    outBuffer,
    `${stamp}_catalog.xlsx`,
    catalogsFolder,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  await prisma.catalog.update({
    where: { id: params.catalogId },
    data: { catalog_file: uploadedCatalog.url },
  });
  await deletePreviousCatalogFileFromImageKit({
    previousCatalogUrl: params.catalogFileUrl,
    newCatalogUrl: uploadedCatalog.url,
    catalogsFolder,
  });

  return { ...partial, catalog_file: uploadedCatalog.url };
}
