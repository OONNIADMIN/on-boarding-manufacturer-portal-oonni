import path from "path";
import os from "os";
import { unlink } from "fs/promises";
import { prisma } from "@/lib/db";
import { manufacturerImageKitRoot } from "@/lib/manufacturer-media-path";
import { isImageKitUploadConfigured, purgeImageKitFolder } from "@/lib/imagekit";

const JOB_DIRECTORIES = [
  path.join(os.tmpdir(), "oonni-catalog-imports"),
  path.join(os.tmpdir(), "oonni-inventory-bulk"),
];

export class ManufacturerDeleteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ManufacturerDeleteError";
    this.status = status;
  }
}

export type ManufacturerDeleteResult = {
  ok: true;
  id: number;
  name: string;
  deleted: {
    users: number;
    images: number;
    catalogs: number;
    products: number;
    inventory_products: number;
    distributors: number;
    catalog_jobs: number;
    inventory_jobs: number;
    logs: number;
  };
  imagekit_warning: string | null;
};

/** Job files live under the process temp dirs. Anything else is left on disk. */
export function isJobStoragePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return JOB_DIRECTORIES.some((dir) => {
    const relative = path.relative(dir, resolved);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

async function removeJobFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.filter(isJobStoragePath).map((filePath) => unlink(filePath).catch(() => undefined))
  );
}

async function removeImageKitMedia(params: {
  root: string;
  fileIds: string[];
}): Promise<string | null> {
  if (!isImageKitUploadConfigured()) {
    return "ImageKit is not configured, so the media folder was left in ImageKit.";
  }
  await purgeImageKitFolder(params.root, { extraFileIds: params.fileIds });
  return null;
}

/**
 * Hard-deletes a manufacturer and portal data tied to it.
 * Users are removed explicitly because their foreign key is ON DELETE SET NULL.
 * Catalogs, products, inventory, distributors, and remaining images cascade from the manufacturer row.
 */
export async function deleteManufacturerAndRelatedData(
  manufacturerId: number,
  options?: {
    actorUserId?: number;
    removeJobFiles?: (paths: string[]) => Promise<void>;
    removeImageKitMedia?: (params: { root: string; fileIds: string[] }) => Promise<string | null>;
  }
): Promise<ManufacturerDeleteResult> {
  const existing = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
  if (!existing || existing.deleted_at) {
    throw new ManufacturerDeleteError("Manufacturer not found", 404);
  }

  const linkedUsers = await prisma.user.findMany({
    where: { manufacturer_id: manufacturerId },
    select: { id: true },
  });
  if (options?.actorUserId && linkedUsers.some((user) => user.id === options.actorUserId)) {
    throw new ManufacturerDeleteError(
      "This manufacturer is linked to your own account. It cannot be deleted while you are signed in as that user.",
      409
    );
  }

  const storedImages = await prisma.image.findMany({
    where: { manufacturer_id: manufacturerId, imagekit_file_id: { not: null } },
    select: { imagekit_file_id: true },
  });

  let imagekitWarning: string | null = null;
  try {
    imagekitWarning = await (options?.removeImageKitMedia ?? removeImageKitMedia)({
      root: manufacturerImageKitRoot(existing),
      fileIds: storedImages
        .map((image) => image.imagekit_file_id)
        .filter((id): id is string => Boolean(id)),
    });
  } catch (error) {
    if (error instanceof ManufacturerDeleteError) throw error;
    const message = error instanceof Error ? error.message : "ImageKit folder delete failed";
    throw new ManufacturerDeleteError(
      `The manufacturer was not deleted because its ImageKit folder could not be removed. ${message}`,
      400
    );
  }

  const snapshot = await prisma.$transaction(async (tx) => {
    const manufacturer = await tx.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer || manufacturer.deleted_at) {
      throw new ManufacturerDeleteError("Manufacturer not found", 404);
    }

    const users = await tx.user.findMany({
      where: { manufacturer_id: manufacturerId },
      select: { id: true },
    });
    if (options?.actorUserId && users.some((user) => user.id === options.actorUserId)) {
      throw new ManufacturerDeleteError(
        "This manufacturer is linked to your own account. It cannot be deleted while you are signed in as that user.",
        409
      );
    }

    const [imageCount, catalogCount, productCount, inventoryCount, distributorCount, catalogJobs, inventoryJobs] =
      await Promise.all([
        tx.image.count({ where: { manufacturer_id: manufacturerId } }),
        tx.catalog.count({ where: { manufacturer_id: manufacturerId } }),
        tx.product.count({ where: { manufacturer_id: manufacturerId } }),
        tx.inventoryProduct.count({ where: { manufacturer_id: manufacturerId } }),
        tx.authorizedDistributor.count({ where: { manufacturer_id: manufacturerId } }),
        tx.catalogImportJob.findMany({
          where: { manufacturer_id: manufacturerId },
          select: { storage_path: true },
        }),
        tx.inventoryBulkJob.findMany({
          where: { manufacturer_id: manufacturerId },
          select: { storage_path: true },
        }),
      ]);

    const userIds = users.map((user) => user.id);
    const logs = await tx.systemErrorLog.deleteMany({
      where: {
        OR: [
          { manufacturer_id: manufacturerId },
          ...(userIds.length ? [{ user_id: { in: userIds } }] : []),
        ],
      },
    });
    const catalogJobsDeleted = await tx.catalogImportJob.deleteMany({
      where: { manufacturer_id: manufacturerId },
    });
    const inventoryJobsDeleted = await tx.inventoryBulkJob.deleteMany({
      where: { manufacturer_id: manufacturerId },
    });
    if (userIds.length) {
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await tx.manufacturer.delete({ where: { id: manufacturerId } });

    return {
      manufacturer,
      paths: [...catalogJobs, ...inventoryJobs].map((job) => job.storage_path),
      deleted: {
        users: userIds.length,
        images: imageCount,
        catalogs: catalogCount,
        products: productCount,
        inventory_products: inventoryCount,
        distributors: distributorCount,
        catalog_jobs: catalogJobsDeleted.count,
        inventory_jobs: inventoryJobsDeleted.count,
        logs: logs.count,
      },
    };
  }, { timeout: 120_000 });

  await (options?.removeJobFiles ?? removeJobFiles)(snapshot.paths);

  return {
    ok: true,
    id: snapshot.manufacturer.id,
    name: snapshot.manufacturer.name,
    deleted: snapshot.deleted,
    imagekit_warning: imagekitWarning,
  };
}
