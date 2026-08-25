import { createHash } from "crypto";
import type { Manufacturer } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createImageKitFolder, uploadToImageKit } from "@/lib/imagekit";
import {
  manufacturerImageKitCatalogImagesFolder,
  manufacturerImageKitImagesFolder,
} from "@/lib/manufacturer-media-path";
import {
  extractHeaderRowCells,
  fillMissingSkuHeader,
  findHeaderColumnIndex,
  parseSpreadsheetRows,
} from "@/lib/catalog-file-headers";
import { detectSkuColumn } from "@/lib/catalog-column-detection";
import { catalogImageStorageKey, createOrReuseImage } from "@/lib/image-record";
import { extractEmbeddedImagesFromXlsx } from "@/lib/xlsx-embedded-images";
import { joinUrlsInCell } from "@/lib/remote-image-import";
import type { CatalogImageIngestProgress, CatalogImageIngestResult } from "@/lib/catalog-image-ingest";

const IMAGE_HEADER_ALIASES = ["image", "images", "imagen", "imagenes", "foto", "fotos", "photo", "photos", "picture"];

export function findCatalogImageColumnIndex(header: string[]): number {
  for (const alias of IMAGE_HEADER_ALIASES) {
    const idx = findHeaderColumnIndex(header, alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Write the uploaded ImageKit URL into the spreadsheet row that owns that SKU/photo. */
export function writeImageUrlIntoCatalogRow(
  rows: string[][],
  rowIndex: number,
  colIndex: number,
  url: string,
  imageHeaderColIndex = -1
): void {
  if (!url || rowIndex < 0) return;
  const row = rows[rowIndex] ?? [];
  rows[rowIndex] = row;
  const targets = new Set<number>([colIndex]);
  if (imageHeaderColIndex >= 0) targets.add(imageHeaderColIndex);
  for (const col of targets) {
    if (col < 0) continue;
    while (row.length <= col) row.push("");
    const current = String(row[col] ?? "").trim();
    if (!current || current === "#VALUE!" || !/^https?:\/\//i.test(current)) {
      row[col] = url;
    } else if (current !== url) {
      row[col] = joinUrlsInCell([current, url], current);
    }
  }
}

const IMPORT_IMAGE_PRE_TRANSFORM = "w-1600,h-1600,c-at_max,q-80";
const UPLOAD_CONCURRENCY = 3;

export async function ingestEmbeddedImagesFromWorkbook(params: {
  buffer: Buffer;
  fileName: string;
  headerRowIndex: number;
  skuColumn: string | null;
  catalogId: number;
  catalogSlug: string;
  manufacturerId: number;
  userId: number;
  manufacturer: Manufacturer;
  /** Pre-parsed rows from a compact workbook (avoids SheetJS on the 100MB+ original). */
  rows?: string[][];
  onProgress?: (progress: CatalogImageIngestProgress) => void;
}): Promise<CatalogImageIngestResult | null> {
  if (!params.fileName.toLowerCase().endsWith(".xlsx") && !params.fileName.toLowerCase().endsWith(".xls")) {
    return null;
  }

  params.onProgress?.({
    phase: "uploading",
    processed: 0,
    total: 1,
    uploaded: 0,
    failed: 0,
    images_created: 0,
  });

  const images = await extractEmbeddedImagesFromXlsx(params.buffer);
  if (!images.length) return null;

  const rows =
    params.rows ??
    (() => {
      const parsed = parseSpreadsheetRows(params.buffer, params.fileName);
      fillMissingSkuHeader(parsed, params.headerRowIndex);
      return parsed;
    })();
  const header = extractHeaderRowCells(rows, params.headerRowIndex);
  const skuName =
    (params.skuColumn && findHeaderColumnIndex(header, params.skuColumn) >= 0
      ? params.skuColumn
      : null) ??
    detectSkuColumn(header.filter(Boolean)) ??
    (findHeaderColumnIndex(header, "sku") >= 0 ? "sku" : null);
  const skuIdx = skuName ? findHeaderColumnIndex(header, skuName) : -1;
  const imageColIdx = findCatalogImageColumnIndex(header);

  const folder = manufacturerImageKitCatalogImagesFolder(params.manufacturer, params.catalogSlug);
  try {
    await createImageKitFolder(
      folder.split("/").pop() || params.catalogSlug,
      manufacturerImageKitImagesFolder(params.manufacturer)
    );
  } catch (error) {
    console.warn("Catalog image folder create skipped:", error);
  }

  const uploadedByHash = new Map<
    string,
    {
      url: string;
      filePath: string;
      fileId: string;
      fileSize: number;
      mime: string;
      width?: number;
      height?: number;
      originalFilename: string;
    }
  >();
  let imagesCreated = 0;
  let uploadFailures = 0;
  let rowsSkippedNoProduct = 0;
  let urlsWritten = 0;
  let processed = 0;

  const emit = () => {
    params.onProgress?.({
      phase: processed >= images.length ? "finalizing" : "uploading",
      processed,
      total: images.length,
      uploaded: uploadedByHash.size,
      failed: uploadFailures,
      images_created: imagesCreated,
    });
  };
  emit();

  let cursor = 0;
  async function worker() {
    while (cursor < images.length) {
      const index = cursor++;
      const item = images[index];
      const sku = skuIdx >= 0 ? String(rows[item.rowIndex]?.[skuIdx] ?? "").trim() : "";
      const hash = createHash("sha256").update(item.buffer).digest("hex");
      try {
        let uploaded = uploadedByHash.get(hash);
        if (!uploaded) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `${stamp}_${sku || "image"}_${item.rowIndex + 1}.${item.ext}`;
          const result = await uploadToImageKit(item.buffer, fileName, folder, item.mime, {
            preTransform: IMPORT_IMAGE_PRE_TRANSFORM,
          });
          uploaded = {
            url: result.url,
            filePath: result.filePath,
            fileId: result.fileId,
            fileSize: result.size || item.buffer.length,
            mime: item.mime,
            width: result.width,
            height: result.height,
            originalFilename: item.filename,
          };
          uploadedByHash.set(hash, uploaded);
        }

        const product = sku
          ? await prisma.product.findFirst({
              where: {
                sku,
                manufacturer_id: params.manufacturerId,
                deleted_at: null,
              },
              orderBy: { id: "desc" },
            })
          : null;
        if (!product) rowsSkippedNoProduct++;

        const outcome = await createOrReuseImage({
          manufacturer_id: params.manufacturerId,
          user_id: params.userId,
          product_id: product?.id ?? null,
          original_filename: uploaded.originalFilename,
          s3_key: catalogImageStorageKey(
            uploaded.filePath,
            product ? `p${product.id}` : `m${params.manufacturerId}`
          ),
          s3_url: uploaded.url,
          imagekit_file_id: uploaded.fileId,
          file_size: uploaded.fileSize,
          mime_type: uploaded.mime,
          width: uploaded.width ?? null,
          height: uploaded.height ?? null,
          optimized: 1,
        });
        if (outcome === "created") imagesCreated++;
        writeImageUrlIntoCatalogRow(rows, item.rowIndex, item.colIndex, uploaded.url, imageColIdx);
        urlsWritten++;
      } catch (error) {
        console.warn("Embedded image import failed:", sku, error);
        uploadFailures++;
      } finally {
        processed++;
        if (processed % 5 === 0 || processed === images.length) emit();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, images.length) }, () => worker()));
  emit();

  return {
    message: "Images imported from embedded spreadsheet pictures",
    catalog_id: params.catalogId,
    catalog_file: "",
    unique_sources_fetched: uploadedByHash.size,
    images_created: imagesCreated,
    upload_failures: uploadFailures,
    rows_missing_product: rowsSkippedNoProduct,
    urls_written: urlsWritten,
  };
}
