import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, unlink, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { backgroundJobQueue } from "@/lib/background-job-queue";
import { parseSpreadsheetRowsOffThread } from "@/lib/spreadsheet-parse-worker";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/api-response";
import { uploadToImageKit, ensureManufacturerImageKitFolders, createImageKitFolder } from "@/lib/imagekit";
import {
  manufacturerImageKitCatalogsFolder,
  manufacturerImageKitImagesFolder,
} from "@/lib/manufacturer-media-path";
import {
  countDataRows,
  extractColumnNamesFromRows,
  extractHeaderRowCells,
  fillMissingSkuHeader,
  findHeaderColumnIndex,
  compactSpreadsheetRows,
  workbookBufferFromRows,
} from "@/lib/catalog-file-headers";
import { createProductsFromCatalogSpreadsheet } from "@/lib/create-products-from-catalog-spreadsheet";
import { ingestCatalogImagesFromSpreadsheet } from "@/lib/catalog-image-ingest";
import { ingestEmbeddedImagesFromWorkbook } from "@/lib/catalog-embedded-image-ingest";
import { detectCatalogMediaUrlColumns, resolveSkuColumn } from "@/lib/catalog-column-detection";
import { listCatalogColumnRules } from "@/lib/catalog-column-rules-service";
import { sendCatalogUploadNotification } from "@/lib/email";
import { prepareCatalogFileForRemoteStore, stripXlsxEmbeddedMedia } from "@/lib/xlsx-embedded-images";
import { isUniqueConstraintError } from "@/lib/image-record";

const running = new Set<string>();

function friendlyCatalogImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Catalog import failed";
  if (/104857600|file size exceeds/i.test(raw) || /invalid file parameter/i.test(raw)) {
    return "The catalog file is too large to store as a single file. Try again — photos are imported from the spreadsheet separately.";
  }
  if (/Unique constraint failed/i.test(raw) || (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002")) {
    return "A photo was already in the catalog. Duplicate photos were skipped so the import could continue.";
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

  kickCatalogImport(publicId);
  return serializeImportJob(job);
}

export function kickCatalogImport(publicId: string): void {
  backgroundJobQueue.enqueue(publicId, () => processCatalogImport(publicId));
}

export const CATALOG_IMPORT_ACTIVE_STATUSES = [
  "queued",
  "analyzing",
  "creating_products",
  "saving_file",
  "importing_images",
] as const;

// Jobs run inside this Node process, so a server restart orphans any job that
// was active. On the polling endpoint: re-enqueue jobs that never started and
// still have their file on disk; mark the rest as failed so the user retries.
// The age threshold avoids racing a job enqueued a moment ago.
const ORPHANED_AFTER_MS = 2 * 60 * 1000;
const ORPHANED_JOB_MESSAGE =
  "The import was interrupted by a server restart. Please upload the file again.";

export async function recoverOrphanedCatalogImportJobs(userId: number): Promise<void> {
  const staleBefore = new Date(Date.now() - ORPHANED_AFTER_MS);
  const candidates = await prisma.catalogImportJob.findMany({
    where: {
      user_id: userId,
      status: { in: [...CATALOG_IMPORT_ACTIVE_STATUSES] },
      updated_at: { lt: staleBefore },
    },
    select: { public_id: true, status: true, storage_path: true },
  });

  const toFail: string[] = [];
  for (const job of candidates) {
    if (backgroundJobQueue.has(job.public_id)) continue;
    if (job.status === "queued" && existsSync(job.storage_path)) {
      // Nothing was processed yet and the file survived — safe to resume.
      kickCatalogImport(job.public_id);
    } else {
      toFail.push(job.public_id);
    }
  }
  if (!toFail.length) return;

  await prisma.catalogImportJob.updateMany({
    where: { public_id: { in: toFail } },
    data: {
      status: "failed",
      phase: "failed",
      error: ORPHANED_JOB_MESSAGE,
      message: ORPHANED_JOB_MESSAGE,
      finished_at: new Date(),
    },
  });
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

    const originalBuffer = await readFile(job.storage_path);
    const lowerName = job.original_filename.toLowerCase();
    const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

    await patchJob(publicId, {
      message: isExcel
        ? "Preparing a compact catalog copy and reading columns…"
        : "Reading spreadsheet and checking columns…",
    });

    const workBuffer =
      isExcel && originalBuffer.length > 8 * 1024 * 1024
        ? await stripXlsxEmbeddedMedia(originalBuffer)
        : originalBuffer;

    const rows = await parseSpreadsheetRowsOffThread(workBuffer, job.original_filename);
    if (!rows.length) throw new Error("The uploaded file is empty");
    if (job.header_row_index >= rows.length) {
      throw new Error(
        `Header row ${job.header_row_index + 1} is outside the file (${rows.length} row(s) found)`
      );
    }

    fillMissingSkuHeader(rows, job.header_row_index);
    const columnNames = extractColumnNamesFromRows(rows, job.header_row_index);
    const headerCells = extractHeaderRowCells(rows, job.header_row_index);
    const columnRules = await listCatalogColumnRules({ activeOnly: true }).catch(() => []);
    const skuColumn = resolveSkuColumn(columnNames, {
      preferred: job.sku_column,
      rules: columnRules,
    });
    const requestedUrlColumns = Array.isArray(job.image_columns)
      ? (job.image_columns as unknown[]).map((c) => String(c).trim()).filter(Boolean)
      : [];
    const sampleRows = rows.slice(job.header_row_index + 1, job.header_row_index + 11);
    const urlColumns = [
      ...new Set([
        ...requestedUrlColumns,
        ...detectCatalogMediaUrlColumns(headerCells, skuColumn, undefined, sampleRows),
      ]),
    ].filter((name) => findHeaderColumnIndex(headerCells, name) >= 0);
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

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: job.manufacturer_id } });
    if (!manufacturer || manufacturer.deleted_at) throw new Error("Manufacturer not found");

    await ensureManufacturerImageKitFolders(manufacturer);

    let productsCreated = 0;
    if (skuColumn) {
      await patchJob(publicId, {
        status: "creating_products",
        phase: "creating_products",
        message: "Creating products in batches…",
      });
      const productResult = await createProductsFromCatalogSpreadsheet({
        buffer: workBuffer,
        fileName: job.original_filename,
        headerRowIndex: job.header_row_index,
        skuColumn,
        columnRules,
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
      productsCreated = productResult.created_count + productResult.reused_count;
      await patchJob(publicId, {
        products_created: productsCreated,
        message:
          productResult.created_count === 0 && productResult.reused_count > 0
            ? `Using ${productResult.reused_count} existing product(s). Importing photos next…`
            : `Ready with ${productsCreated} product(s).`,
      });
    }

    let imagesCreated = 0;
    let imagesFailed = 0;

    if (isExcel) {
      await patchJob(publicId, {
        status: "importing_images",
        phase: "importing_images",
        message: "Reading photos embedded in the spreadsheet…",
      });
      try {
        await createImageKitFolder(catalog.slug, manufacturerImageKitImagesFolder(manufacturer));
      } catch (folderErr) {
        console.warn("Catalog image folder create skipped:", folderErr);
      }
      const embedded = await ingestEmbeddedImagesFromWorkbook({
        buffer: originalBuffer,
        fileName: job.original_filename,
        headerRowIndex: job.header_row_index,
        skuColumn,
        catalogId: catalog.id,
        catalogSlug: catalog.slug,
        manufacturerId: job.manufacturer_id,
        userId: job.user_id,
        manufacturer,
        rows,
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

    const catalogSource = workbookBufferFromRows(rows, job.header_row_index);
    let catalogFileUrl = "";

    if (skuColumn && urlColumns.length) {
      await patchJob(publicId, {
        status: "importing_images",
        phase: "importing_images",
        message: "Importing product files from URLs…",
      });
      try {
        const ingest = await ingestCatalogImagesFromSpreadsheet({
          catalogId: catalog.id,
          manufacturerId: job.manufacturer_id,
          userId: job.user_id,
          skuColumn,
          imageColumns: urlColumns,
          catalogFileUrl: "catalog.xlsx",
          headerRowIndex: job.header_row_index,
          spreadsheetBuffer: catalogSource,
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
        catalogFileUrl = ingest.catalog_file || catalogFileUrl;
      } catch (ingestErr) {
        console.warn("Catalog URL image import skipped:", ingestErr);
        imagesFailed += 1;
        await patchJob(publicId, {
          message: "Some product files could not be imported. Saving the catalog file…",
        });
      }
    }

    if (!catalogFileUrl) {
      await patchJob(publicId, {
        status: "saving_file",
        phase: "saving_file",
        message:
          imagesCreated > 0
            ? "Saving catalog file with product photo URLs…"
            : "Saving catalog file…",
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const folder = manufacturerImageKitCatalogsFolder(manufacturer);
      const archiveName = job.original_filename.replace(/\.xls$/i, ".xlsx");
      const archive = await prepareCatalogFileForRemoteStore(catalogSource, archiveName);
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
          const tooLarge = /26214400|104857600|file size exceeds/i.test(
            storeErr instanceof Error ? storeErr.message : String(storeErr)
          );
          if (tooLarge) {
            try {
              const Papa = (await import("papaparse")).default;
              const csv = Buffer.from(
                Papa.unparse(compactSpreadsheetRows(rows, job.header_row_index)),
                "utf8"
              );
              if (csv.length < 25 * 1024 * 1024) {
                const uploaded = await uploadToImageKit(
                  csv,
                  `${timestamp}_${archive.fileName.replace(/\.[^.]+$/, "")}.csv`,
                  folder,
                  "text/csv"
                );
                catalogFileUrl = uploaded.url;
                await prisma.catalog.update({
                  where: { id: catalog.id },
                  data: { catalog_file: uploaded.url },
                });
              }
            } catch (csvErr) {
              console.warn("Catalog CSV store skipped:", csvErr);
            }
          }
          if (!catalogFileUrl) {
            await patchJob(publicId, {
              message:
                "Photos were imported, but the catalog spreadsheet was too large to store. You can still use the products and photos.",
            });
          }
        }
      }
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
      message:
        imagesCreated > 0
          ? `Catalog import finished. ${productsCreated} product(s), ${imagesCreated} photo(s).`
          : "Catalog import finished. You can keep working.",
      products_created: productsCreated,
      images_created: imagesCreated,
      images_failed: imagesFailed,
      finished_at: new Date(),
      progress_current: 1,
      progress_total: 1,
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      console.warn("Catalog import reused existing photos:", e);
      await patchJob(publicId, {
        status: "completed",
        phase: "completed",
        error: null,
        message:
          "Catalog import finished. Photos that were already uploaded were reused so nothing was duplicated.",
        finished_at: new Date(),
        progress_current: 1,
        progress_total: 1,
      }).catch(() => undefined);
      return;
    }
    const message = friendlyCatalogImportError(e);
    console.error("Catalog import job failed:", e);
    await patchJob(publicId, {
      status: "failed",
      phase: "failed",
      error: message,
      message,
      finished_at: new Date(),
      progress_current: 1,
      progress_total: 1,
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
