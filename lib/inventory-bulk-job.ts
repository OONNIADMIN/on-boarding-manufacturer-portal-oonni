import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { prisma } from "@/lib/db";
import {
  importInventoryWorkbook,
  type InventoryBulkKind,
  type InventoryBulkProgress,
} from "@/lib/inventory-bulk";

const running = new Set<string>();

export const INVENTORY_BULK_ACTIVE_STATUSES = [
  "queued",
  "reading",
  "updating",
  "publishing",
] as const;

export type InventoryBulkJobStatus =
  | "queued"
  | "reading"
  | "updating"
  | "publishing"
  | "completed"
  | "failed";

export type InventoryBulkJobView = {
  id: string;
  filename: string;
  kind: InventoryBulkKind | null;
  status: InventoryBulkJobStatus;
  phase: string;
  message: string | null;
  progress_current: number;
  progress_total: number;
  updated_count: number;
  skipped_count: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

function jobsDir(): string {
  return path.join(os.tmpdir(), "oonni-inventory-bulk");
}

export function serializeInventoryBulkJob(job: {
  public_id: string;
  original_filename: string;
  kind: string | null;
  status: string;
  phase: string;
  message: string | null;
  progress_current: number;
  progress_total: number;
  updated_count: number;
  skipped_count: number;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}): InventoryBulkJobView {
  return {
    id: job.public_id,
    filename: job.original_filename,
    kind: job.kind === "variants" || job.kind === "products" ? job.kind : null,
    status: job.status as InventoryBulkJobStatus,
    phase: job.phase,
    message: job.message,
    progress_current: job.progress_current,
    progress_total: job.progress_total,
    updated_count: job.updated_count,
    skipped_count: job.skipped_count,
    error: job.error,
    created_at: job.created_at.toISOString(),
    finished_at: job.finished_at?.toISOString() ?? null,
  };
}

export async function enqueueInventoryBulkImport(params: {
  userId: number;
  manufacturerId: number;
  buffer: Buffer;
  safeFileName: string;
  kind?: InventoryBulkKind;
}): Promise<InventoryBulkJobView> {
  const publicId = randomUUID().replace(/-/g, "").slice(0, 32);
  await mkdir(jobsDir(), { recursive: true });
  const storagePath = path.join(jobsDir(), `${publicId}-${params.safeFileName}`);
  await writeFile(storagePath, params.buffer);

  const job = await prisma.inventoryBulkJob.create({
    data: {
      public_id: publicId,
      user_id: params.userId,
      manufacturer_id: params.manufacturerId,
      original_filename: params.safeFileName,
      storage_path: storagePath,
      kind: params.kind ?? null,
      status: "queued",
      phase: "queued",
      message: "File received. Applying spreadsheet edits in the background.",
    },
  });

  void processInventoryBulkImport(publicId);
  return serializeInventoryBulkJob(job);
}

export function kickInventoryBulkImport(publicId: string): void {
  void processInventoryBulkImport(publicId);
}

async function patchJob(
  publicId: string,
  data: Parameters<typeof prisma.inventoryBulkJob.update>[0]["data"]
) {
  return prisma.inventoryBulkJob.update({
    where: { public_id: publicId },
    data,
  });
}

async function reportProgress(publicId: string, progress: InventoryBulkProgress) {
  await patchJob(publicId, {
    status: progress.phase,
    phase: progress.phase,
    message: progress.message,
    progress_current: progress.current,
    progress_total: progress.total,
  });
}

async function processInventoryBulkImport(publicId: string): Promise<void> {
  if (running.has(publicId)) return;
  running.add(publicId);
  try {
    const job = await prisma.inventoryBulkJob.findUnique({ where: { public_id: publicId } });
    if (!job || job.status === "completed" || job.status === "failed") return;

    await patchJob(publicId, {
      status: "reading",
      phase: "reading",
      message: "Reading spreadsheet…",
    });

    const buffer = await readFile(job.storage_path);
    const kind =
      job.kind === "variants" || job.kind === "products" ? job.kind : undefined;
    const result = await importInventoryWorkbook(
      job.manufacturer_id,
      job.user_id,
      buffer,
      kind,
      (progress) => reportProgress(publicId, progress)
    );

    const extra = result.errors.length ? ` ${result.errors.slice(0, 2).join(" ")}` : "";
    const publishedNote = result.traide_errors.length
      ? " Some items could not be published yet."
      : "";
    await patchJob(publicId, {
      status: "completed",
      phase: "completed",
      kind: result.kind,
      message: `Updated ${result.updated} ${result.kind}. Skipped ${result.skipped}.${publishedNote}${extra}`.trim(),
      error: null,
      updated_count: result.updated,
      skipped_count: result.skipped,
      progress_current: Math.max(result.updated + result.skipped, 1),
      progress_total: Math.max(result.updated + result.skipped, 1),
      finished_at: new Date(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to apply spreadsheet edits";
    console.error("inventory bulk job failed:", e);
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
    const job = await prisma.inventoryBulkJob.findUnique({
      where: { public_id: publicId },
      select: { storage_path: true },
    });
    if (job?.storage_path) {
      await unlink(job.storage_path).catch(() => undefined);
    }
  }
}
