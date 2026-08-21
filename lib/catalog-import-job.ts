import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/api-response";
import { uploadToImageKit } from "@/lib/imagekit";
import { manufacturerImageKitCatalogsFolder } from "@/lib/manufacturer-media-path";
import {
  countDataRows,
  extractColumnNamesFromRows,
  fillMissingSkuHeader,
  parseSpreadsheetRows,
} from "@/lib/catalog-file-headers";
import { createProductsFromCatalogSpreadsheet } from "@/lib/create-products-from-catalog-spreadsheet";
import { ingestCatalogImagesFromSpreadsheet } from "@/lib/catalog-image-ingest";
import { ingestEmbeddedImagesFromWorkbook } from "@/lib/catalog-embedded-image-ingest";
import { detectSkuColumn } from "@/lib/catalog-column-detection";
import { sendCatalogUploadNotification } from "@/lib/email";
import { prepareCatalogFileForRemoteStore } from "@/lib/xlsx-embedded-images";

const running = new Set<string>();

function friendlyCatalogImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Catalog import failed";
  if (/104857600|file size exceeds/i.test(raw) || /invalid file parameter/i.test(raw)) {
    return "The catalog file is too large to store as a single file. Try again — photos are imported from the spreadsheet separately.";
  }
  return raw;
}

export type CatalogImportJobStatus =
  | "queued"
  | "analyzing"
  | "creating_products"
  | "saving_file"
  | "importing_images"
  | "completed"
  | "failed";

export type CatalogImportJobView = {
  id: string;
  filename: string;
  status: CatalogImportJobStatus;
  phase: string;
  message: string | null;
  progress_current: number;
  progress_total: number;
  catalog_id: number | null;
  products_created: number;
  images_created: number;
  images_failed: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

function jobsDir(): string {
  return path.join(os.tmpdir(), "oonni-catalog-imports");
}

export function serializeImportJob(job: {
  public_id: string;
  original_filename: string;
  status: string;
  phase: string;
  message: string | null;
  progress_current: number;
  progress_total: number;
  catalog_id: number | null;
  products_created: number;
  images_created: number;
  images_failed: number;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}): CatalogImportJobView {
  return {
    id: job.public_id,
    filename: job.original_filename,
    status: job.status as CatalogImportJobStatus,
    phase: job.phase,
    message: job.message,
    progress_current: job.progress_current,
    progress_total: job.progress_total,
    catalog_id: job.catalog_id,
    products_created: job.products_created,
    images_created: job.images_created,
    images_failed: job.images_failed,
    error: job.error,
    created_at: job.created_at.toISOString(),
    finished_at: job.finished_at?.toISOString() ?? null,
  };
}

export async function enqueueCatalogImport(params: {
  userId: number;
  manufacturerId: number;
  buffer: Buffer;
  safeFileName: string;
  headerRowIndex: number;
  skuColumn: string | null;
  imageColumns: string[];
}): Promise<CatalogImportJobView> {
  const publicId = randomUUID().replace(/-/g, "").slice(0, 32);
  await mkdir(jobsDir(), { recursive: true });
  const storagePath = path.join(jobsDir(), `${publicId}-${params.safeFileName}`);
  await writeFile(storagePath, params.buffer);

  const job = await prisma.catalogImportJob.create({
    data: {
      public_id: publicId,
      user_id: params.userId,
      manufacturer_id: params.manufacturerId,
      original_filename: params.safeFileName,
      storage_path: storagePath,
      header_row_index: params.headerRowIndex,
      sku_column: params.skuColumn,
      image_columns: params.imageColumns as Prisma.InputJsonValue,
      status: "queued",
      phase: "queued",
      message: "File received. Analysis will start in the background.",
    },
  });

  void processCatalogImport(publicId);
  return serializeImportJob(job);
}

export function kickCatalogImport(publicId: string): void {
  void processCatalogImport(publicId);
}

async function patchJob(
  publicId: string,
  data: Parameters<typeof prisma.catalogImportJob.update>[0]["data"]
) {
  return prisma.catalogImportJob.update({
    where: { public_id: publicId },
    data,
  });
}

async function processCatalogImport(publicId: string): Promise<void> {
  if (running.has(publicId)) return;
  running.add(publicId);
  try {
    const job = await prisma.catalogImportJob.findUnique({ where: { public_id: publicId } });
    if (!job || job.status === "completed" || job.status === "failed") return;

    await patchJob(publicId, {
      status: "analyzing",
      phase: "analyzing",
      message: "Reading spreadsheet and checking columns…",
    });

    const buffer = await readFile(job.storage_path);
    const rows = parseSpreadsheetRows(buffer, job.original_filename);
    if (!rows.length) throw new Error("The uploaded file is empty");
    if (job.header_row_index >= rows.length) {
      throw new Error(
        `Header row ${job.header_row_index + 1} is outside the file (${rows.length} row(s) found)`
      );
    }

    fillMissingSkuHeader(rows, job.header_row_index);
    const columnNames = extractColumnNamesFromRows(rows, job.header_row_index);
    const skuColumn = job.sku_column || detectSkuColumn(columnNames);
    const dataRows = countDataRows(rows, job.header_row_index);
    const catalogName = job.original_filename.replace(/\.[^.]+$/, "") || "catalog";
    let slug = slugify(catalogName);
    const base = slug;
    let i = 1;
    while (await prisma.catalog.findUnique({ where: { slug } })) slug = `${base}-${i++}`;

    const catalog = await prisma.catalog.create({
      data: {
        manufacturer_id: job.manufacturer_id,
        name: catalogName,
        slug,
        description: `Catalog uploaded from ${job.original_filename}`,
        header_row_index: job.header_row_index,
      },
    });

    await patchJob(publicId, {
      catalog_id: catalog.id,
      progress_total: Math.max(dataRows, 1),
      message: `Found ${dataRows} data row(s) and ${columnNames.length} column(s).`,
    });

    let productsCreated = 0;
    if (skuColumn) {
      await patchJob(publicId, {
        status: "creating_products",
        phase: "creating_products",
        message: "Creating products in batches…",
      });
      const productResult = await createProductsFromCatalogSpreadsheet({
        buffer,
        fileName: job.original_filename,
        headerRowIndex: job.header_row_index,
        skuColumn,
        catalogId: catalog.id,
        manufacturerId: job.manufacturer_id,
        onProgress: async (current, total) => {
          await patchJob(publicId, {
            progress_current: current,
            progress_total: total,
            message: `Creating products ${current} of ${total}…`,
          });
        },
      });
      productsCreated = productResult.created_count;
      await patchJob(publicId, { products_created: productsCreated });
    }

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: job.manufacturer_id } });
    if (!manufacturer || manufacturer.deleted_at) throw new Error("Manufacturer not found");

    let imagesCreated = 0;
    let imagesFailed = 0;

    if (skuColumn) {
      await patchJob(publicId, {
        status: "importing_images",
        phase: "importing_images",
        message: "Importing photos embedded in the spreadsheet…",
      });
      const embedded = await ingestEmbeddedImagesFromWorkbook({
        buffer,
        fileName: job.original_filename,
        headerRowIndex: job.header_row_index,
        skuColumn,
        catalogId: catalog.id,
        manufacturerId: job.manufacturer_id,
        userId: job.user_id,
        manufacturer,
        onProgress: (progress) => {
          void patchJob(publicId, {
            progress_current: progress.processed,
            progress_total: Math.max(progress.total, 1),
            images_created: progress.images_created,
            images_failed: progress.failed,
            message:
              progress.phase === "finalizing"
                ? "Finishing embedded photo import…"
                : `Importing embedded photos ${progress.processed} of ${progress.total}…`,
          });
        },
      });
      if (embedded) {
        imagesCreated += embedded.images_created;
        imagesFailed += embedded.upload_failures;
      }
    }

    await patchJob(publicId, {
      status: "saving_file",
      phase: "saving_file",
      message:
        buffer.length >= 100 * 1024 * 1024
          ? "Saving a compact catalog copy. Product photos are imported separately…"
          : "Saving catalog file…",
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const folder = manufacturerImageKitCatalogsFolder(manufacturer);
    const archive = await prepareCatalogFileForRemoteStore(buffer, job.original_filename);
    let catalogFileUrl = "";
    if (archive) {
      try {
        const uploaded = await uploadToImageKit(
          archive.buffer,
          `${timestamp}_${archive.fileName}`,
          folder,
          archive.mimeType
        );
        catalogFileUrl = uploaded.url;
        await prisma.catalog.update({
          where: { id: catalog.id },
          data: { catalog_file: uploaded.url },
        });
      } catch (storeErr) {
        console.warn("Catalog file store skipped:", storeErr);
        await patchJob(publicId, {
          message: "Catalog data was processed. The original spreadsheet was too large to keep as a single file.",
        });
      }
    }

    const imageColumns = Array.isArray(job.image_columns)
      ? (job.image_columns as unknown[]).map((c) => String(c).trim()).filter(Boolean)
      : [];

    if (skuColumn && imageColumns.length) {
      await patchJob(publicId, {
        status: "importing_images",
        phase: "importing_images",
        message: "Importing product images from URLs…",
      });
      const ingest = await ingestCatalogImagesFromSpreadsheet({
        catalogId: catalog.id,
        manufacturerId: job.manufacturer_id,
        userId: job.user_id,
        skuColumn,
        imageColumns,
        catalogFileUrl: catalogFileUrl || "catalog.xlsx",
        headerRowIndex: job.header_row_index,
        spreadsheetBuffer: buffer,
        manufacturer,
        onProgress: (progress) => {
          void patchJob(publicId, {
            progress_current: progress.processed,
            progress_total: Math.max(progress.total, 1),
            images_created: imagesCreated + progress.images_created,
            images_failed: imagesFailed + progress.failed,
            message:
              progress.phase === "finalizing"
                ? "Finishing image import…"
                : `Importing images ${progress.processed} of ${progress.total}…`,
          });
        },
      });
      imagesCreated += ingest.images_created;
      imagesFailed += ingest.upload_failures;
    }

    try {
      const [user, adminUsers] = await Promise.all([
        prisma.user.findUnique({ where: { id: job.user_id }, select: { name: true, email: true } }),
        prisma.user.findMany({
          where: { role: { name: "admin" }, is_active: 1 },
          select: { email: true },
        }),
      ]);
      const adminEmails = adminUsers.map((u) => u.email);
      if (adminEmails.length && user) {
        await sendCatalogUploadNotification({
          adminEmails,
          manufacturerName: manufacturer.name,
          userName: user.name,
          userEmail: user.email,
          catalogName: catalog.name,
          fileType: job.original_filename.split(".").pop()?.toUpperCase() ?? "FILE",
          fileSize: "N/A",
          catalogId: catalog.id,
          imagesUploaded: imagesCreated,
          imagesFailed,
        });
      }
    } catch (notifyErr) {
      console.warn("Catalog upload notification failed:", notifyErr);
    }

    await patchJob(publicId, {
      status: "completed",
      phase: "completed",
      message: "Catalog import finished. You can keep working.",
      products_created: productsCreated,
      images_created: imagesCreated,
      images_failed: imagesFailed,
      finished_at: new Date(),
      progress_current: 1,
      progress_total: 1,
    });
  } catch (e) {
    const message = friendlyCatalogImportError(e);
    console.error("Catalog import job failed:", e);
    await patchJob(publicId, {
      status: "failed",
      phase: "failed",
      error: message,
      message,
      finished_at: new Date(),
    }).catch(() => undefined);
  } finally {
    running.delete(publicId);
    const job = await prisma.catalogImportJob.findUnique({
      where: { public_id: publicId },
      select: { storage_path: true },
    });
    if (job?.storage_path) {
      await unlink(job.storage_path).catch(() => undefined);
    }
  }
}
