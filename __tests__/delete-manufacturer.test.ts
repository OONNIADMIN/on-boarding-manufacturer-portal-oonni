import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => {
  const tx = {
    manufacturer: { findUnique: vi.fn(), delete: vi.fn() },
    user: { findMany: vi.fn(), deleteMany: vi.fn() },
    image: { findMany: vi.fn(), count: vi.fn() },
    catalog: { count: vi.fn() },
    product: { count: vi.fn() },
    inventoryProduct: { count: vi.fn() },
    authorizedDistributor: { count: vi.fn() },
    catalogImportJob: { findMany: vi.fn(), deleteMany: vi.fn() },
    inventoryBulkJob: { findMany: vi.fn(), deleteMany: vi.fn() },
    systemErrorLog: { deleteMany: vi.fn() },
  };
  return { tx };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    manufacturer: tx.manufacturer,
    user: tx.user,
    image: tx.image,
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import {
  deleteManufacturerAndRelatedData,
  isJobStoragePath,
  ManufacturerDeleteError,
} from "@/lib/delete-manufacturer";

function manufacturer() {
  return {
    id: 4,
    name: "Acme Tools",
    slug: "acme-tools",
    imagekit_media_root: null,
    deleted_at: null,
  };
}

describe("isJobStoragePath", () => {
  it("accepts files inside the catalog and inventory job folders", () => {
    expect(isJobStoragePath(path.join(os.tmpdir(), "oonni-catalog-imports", "job.xlsx"))).toBe(true);
    expect(isJobStoragePath(path.join(os.tmpdir(), "oonni-inventory-bulk", "edit.xlsx"))).toBe(true);
  });

  it("rejects the folder itself and paths outside those directories", () => {
    expect(isJobStoragePath(path.join(os.tmpdir(), "oonni-catalog-imports"))).toBe(false);
    expect(isJobStoragePath(path.join(os.tmpdir(), "other", "job.xlsx"))).toBe(false);
  });
});

describe("deleteManufacturerAndRelatedData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.manufacturer.findUnique.mockResolvedValue(manufacturer());
    tx.user.findMany.mockResolvedValue([{ id: 9 }, { id: 10 }]);
    tx.image.findMany.mockResolvedValue([{ imagekit_file_id: "file-1" }]);
    tx.image.count.mockResolvedValue(3);
    tx.catalog.count.mockResolvedValue(1);
    tx.product.count.mockResolvedValue(2);
    tx.inventoryProduct.count.mockResolvedValue(4);
    tx.authorizedDistributor.count.mockResolvedValue(1);
    tx.catalogImportJob.findMany.mockResolvedValue([{ storage_path: "/tmp/catalog.xlsx" }]);
    tx.inventoryBulkJob.findMany.mockResolvedValue([{ storage_path: "/tmp/inventory.xlsx" }]);
    tx.systemErrorLog.deleteMany.mockResolvedValue({ count: 2 });
    tx.catalogImportJob.deleteMany.mockResolvedValue({ count: 1 });
    tx.inventoryBulkJob.deleteMany.mockResolvedValue({ count: 1 });
    tx.user.deleteMany.mockResolvedValue({ count: 2 });
    tx.manufacturer.delete.mockResolvedValue(manufacturer());
  });

  it("deletes manufacturer users before the manufacturer row and then cleans files", async () => {
    const order: string[] = [];
    tx.user.deleteMany.mockImplementation(async () => {
      order.push("users");
      return { count: 2 };
    });
    tx.manufacturer.delete.mockImplementation(async () => {
      order.push("manufacturer");
      return manufacturer();
    });
    const removeJobFiles = vi.fn(async () => undefined);
    const removeImageKitMedia = vi.fn(async () => null);

    const result = await deleteManufacturerAndRelatedData(4, {
      actorUserId: 1,
      removeJobFiles,
      removeImageKitMedia,
    });

    expect(order).toEqual(["users", "manufacturer"]);
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [9, 10] } } });
    expect(tx.systemErrorLog.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ manufacturer_id: 4 }, { user_id: { in: [9, 10] } }] },
    });
    expect(removeJobFiles).toHaveBeenCalledWith(["/tmp/catalog.xlsx", "/tmp/inventory.xlsx"]);
    expect(removeImageKitMedia).toHaveBeenCalledWith({
      root: "/Acme-Tools",
      fileIds: ["file-1"],
    });
    expect(result.deleted).toMatchObject({
      users: 2,
      images: 3,
      catalogs: 1,
      products: 2,
      inventory_products: 4,
      distributors: 1,
    });
    expect(result.imagekit_warning).toBeNull();
    expect(removeImageKitMedia).toHaveBeenCalled();
    expect(tx.manufacturer.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
      removeImageKitMedia.mock.invocationCallOrder[0]
    );
  });

  it("keeps the manufacturer when the ImageKit folder cannot be removed", async () => {
    await expect(
      deleteManufacturerAndRelatedData(4, {
        actorUserId: 1,
        removeImageKitMedia: async () => {
          throw new Error("folder still has files");
        },
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.manufacturer.delete).not.toHaveBeenCalled();
  });

  it("does not delete when the signed-in admin belongs to that manufacturer", async () => {
    tx.user.findMany.mockResolvedValue([{ id: 1 }]);

    await expect(deleteManufacturerAndRelatedData(4, { actorUserId: 1 })).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.manufacturer.delete).not.toHaveBeenCalled();
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
  });

  it("returns not found for a missing or already removed manufacturer", async () => {
    tx.manufacturer.findUnique.mockResolvedValue(null);
    await expect(deleteManufacturerAndRelatedData(4)).rejects.toBeInstanceOf(ManufacturerDeleteError);

    tx.manufacturer.findUnique.mockResolvedValue({ ...manufacturer(), deleted_at: new Date() });
    await expect(deleteManufacturerAndRelatedData(4)).rejects.toMatchObject({ status: 404 });
    expect(tx.manufacturer.delete).not.toHaveBeenCalled();
  });
});
