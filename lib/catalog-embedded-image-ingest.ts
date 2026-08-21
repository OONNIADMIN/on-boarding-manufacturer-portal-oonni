import { createHash } from "crypto";
import type { Manufacturer } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uploadToImageKit } from "@/lib/imagekit";
import { manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";
import {
  extractHeaderRowCells,
  fillMissingSkuHeader,
  findHeaderColumnIndex,
  parseSpreadsheetRows,
} from "@/lib/catalog-file-headers";
import { detectSkuColumn } from "@/lib/catalog-column-detection";
import { extractEmbeddedImagesFromXlsx } from "@/lib/xlsx-embedded-images";
import type { CatalogImageIngestProgress, CatalogImageIngestResult } from "@/lib/catalog-image-ingest";

const IMPORT_IMAGE_PRE_TRANSFORM = "w-1600,h-1600,c-at_max,q-80";
const UPLOAD_CONCURRENCY = 3;

export async function ingestEmbeddedImagesFromWorkbook(params: {
  buffer: Buffer;
  fileName: string;
  headerRowIndex: number;
  skuColumn: string | null;
  catalogId: number;
  manufacturerId: number;
  userId: number;
  manufacturer: Manufacturer;
  onProgress?: (progress: CatalogImageIngestProgress) => void;
}): Promise<CatalogImageIngestResult | null> {
  if (!params.fileName.toLowerCase().endsWith(".xlsx") && !params.fileName.toLowerCase().endsWith(".xls")) {
    return null;
  }

  const images = await extractEmbeddedImagesFromXlsx(params.buffer);
  if (!images.length) return null;

  const rows = parseSpreadsheetRows(params.buffer, params.fileName);
  fillMissingSkuHeader(rows, params.headerRowIndex);
  const header = extractHeaderRowCells(rows, params.headerRowIndex);
  const skuName =
    (params.skuColumn && findHeaderColumnIndex(header, params.skuColumn) >= 0
      ? params.skuColumn
      : null) ??
    detectSkuColumn(header.filter(Boolean)) ??
    (findHeaderColumnIndex(header, "sku") >= 0 ? "sku" : null);
  const skuIdx = skuName ? findHeaderColumnIndex(header, skuName) : -1;
  if (skuIdx < 0) {
    return {
      message: "Embedded images found, but no SKU column to link them",
      catalog_id: params.catalogId,
      catalog_file: "",
      unique_sources_fetched: images.length,
      images_created: 0,
      upload_failures: images.length,
      rows_missing_product: 0,
    };
  }

  const folder = manufacturerImageKitImagesFolder(params.manufacturer);
  const uploadedByHash = new Map<string, { url: string; filePath: string; fileId: string; fileSize: number; mime: string; width?: number; height?: number; originalFilename: string }>();
  let imagesCreated = 0;
  let uploadFailures = 0;
  let rowsSkippedNoProduct = 0;
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
      const sku = String(rows[item.rowIndex]?.[skuIdx] ?? "").trim();
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
                catalog_id: params.catalogId,
                deleted_at: null,
              },
            })
          : null;
        if (!product) {
          rowsSkippedNoProduct++;
        } else {
          await prisma.image.create({
            data: {
              manufacturer_id: params.manufacturerId,
              user_id: params.userId,
              product_id: product.id,
              original_filename: uploaded.originalFilename,
              s3_key: `${uploaded.filePath}#${item.rowIndex}-${item.colIndex}`,
              s3_url: uploaded.url,
              imagekit_file_id: uploaded.fileId,
              file_size: uploaded.fileSize,
              mime_type: uploaded.mime,
              width: uploaded.width ?? null,
              height: uploaded.height ?? null,
              optimized: 1,
            },
          });
          imagesCreated++;
        }
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
  };
}
