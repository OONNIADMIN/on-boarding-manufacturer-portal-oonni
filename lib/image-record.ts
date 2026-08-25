import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canonicalImageKitUrl } from "@/lib/imagekit";

const S3_KEY_MAX = 500;

export function catalogImageStorageKey(filePath: string, uniqueSuffix: string): string {
  const suffix = uniqueSuffix.startsWith("#") ? uniqueSuffix : `#${uniqueSuffix}`;
  if (filePath.length + suffix.length <= S3_KEY_MAX) return `${filePath}${suffix}`;
  return `${filePath.slice(0, Math.max(1, S3_KEY_MAX - suffix.length))}${suffix}`;
}

export function imageKitFilePathFromKey(s3Key: string): string {
  const hash = s3Key.indexOf("#");
  return hash >= 0 ? s3Key.slice(0, hash) : s3Key;
}

export function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current !== "object") break;
    const record = current as {
      code?: unknown;
      message?: unknown;
      name?: unknown;
      cause?: unknown;
      meta?: { driverAdapterError?: { name?: unknown; message?: unknown } };
    };
    if (record.code === "P2002") return true;
    const message = String(record.message ?? "");
    if (/unique constraint failed/i.test(message) || /UniqueConstraintViolation/i.test(message)) {
      return true;
    }
    const adapterName = String(record.meta?.driverAdapterError?.name ?? "");
    const adapterMessage = String(record.meta?.driverAdapterError?.message ?? "");
    if (/UniqueConstraintViolation/i.test(adapterName) || /unique constraint/i.test(adapterMessage)) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

export type ReusableImageRow = {
  id: number;
  product_id: number | null;
  s3_key: string;
  s3_url: string;
  imagekit_file_id: string | null;
  file_size: bigint;
  mime_type: string;
  width: number | null;
  height: number | null;
  original_filename: string;
};

const IMAGE_SELECT = {
  id: true,
  product_id: true,
  s3_key: true,
  s3_url: true,
  imagekit_file_id: true,
  file_size: true,
  mime_type: true,
  width: true,
  height: true,
  original_filename: true,
} as const;

function fileMatchWhere(params: {
  fileId?: string | null;
  filePath?: string | null;
  url?: string | null;
}): Prisma.ImageWhereInput[] {
  const or: Prisma.ImageWhereInput[] = [];
  const fileId = params.fileId?.trim();
  const filePath = params.filePath?.trim();
  const url = params.url?.trim();
  if (fileId) or.push({ imagekit_file_id: fileId });
  if (url) {
    or.push({ s3_url: url });
    const canonical = canonicalImageKitUrl(url);
    if (canonical && canonical !== url) or.push({ s3_url: canonical });
  }
  if (filePath) {
    or.push({ s3_key: filePath });
    or.push({ s3_key: { startsWith: `${filePath}#` } });
  }
  return or;
}

export async function findProductImageForFile(params: {
  manufacturerId: number;
  productId: number;
  fileId?: string | null;
  filePath?: string | null;
  url?: string | null;
}): Promise<ReusableImageRow | null> {
  const or = fileMatchWhere(params);
  if (!or.length) return null;
  return prisma.image.findFirst({
    where: {
      manufacturer_id: params.manufacturerId,
      product_id: params.productId,
      deleted_at: null,
      OR: or,
    },
    select: IMAGE_SELECT,
  });
}

export async function findManufacturerImageForFile(params: {
  manufacturerId: number;
  fileId?: string | null;
  filePath?: string | null;
  url?: string | null;
}): Promise<ReusableImageRow | null> {
  const or = fileMatchWhere(params);
  if (!or.length) return null;
  return prisma.image.findFirst({
    where: {
      manufacturer_id: params.manufacturerId,
      deleted_at: null,
      OR: or,
    },
    orderBy: { id: "asc" },
    select: IMAGE_SELECT,
  });
}

const inFlightByKey = new Map<string, Promise<"created" | "reused">>();

async function restoreAndReuse(
  existing: { id: number; product_id: number | null; deleted_at: Date | null },
  productId: number | null
): Promise<"created" | "reused"> {
  const patch: Prisma.ImageUncheckedUpdateInput = {};
  if (existing.deleted_at) patch.deleted_at = null;
  if (!existing.product_id && productId) patch.product_id = productId;
  if (Object.keys(patch).length) {
    await prisma.image.update({ where: { id: existing.id }, data: patch });
  }
  return existing.deleted_at ? "created" : "reused";
}

async function createOrReuseImageUnlocked(
  data: Prisma.ImageUncheckedCreateInput
): Promise<"created" | "reused"> {
  const key = String(data.s3_key ?? "").trim();
  if (!key) throw new Error("Image storage key is required");

  const filePath = imageKitFilePathFromKey(key);
  const productId = typeof data.product_id === "number" ? data.product_id : null;
  const manufacturerId = Number(data.manufacturer_id);

  if (productId) {
    const onProduct = await findProductImageForFile({
      manufacturerId,
      productId,
      fileId: typeof data.imagekit_file_id === "string" ? data.imagekit_file_id : null,
      filePath,
      url: typeof data.s3_url === "string" ? data.s3_url : null,
    });
    if (onProduct) return "reused";
  }

  const existingByNewKey = await prisma.image.findUnique({
    where: { s3_key: key },
    select: { id: true, product_id: true, deleted_at: true },
  });
  if (existingByNewKey) return restoreAndReuse(existingByNewKey, productId);

  // Previous imports stored the ImageKit path with no suffix. Reuse that row
  // instead of inserting a duplicate key.
  if (filePath && filePath !== key) {
    const existingByPath = await prisma.image.findUnique({
      where: { s3_key: filePath },
      select: { id: true, product_id: true, deleted_at: true, manufacturer_id: true },
    });
    if (existingByPath && existingByPath.manufacturer_id === manufacturerId) {
      if (!existingByPath.product_id || existingByPath.product_id === productId) {
        return restoreAndReuse(existingByPath, productId);
      }
    }
  }

  try {
    await prisma.image.upsert({
      where: { s3_key: key },
      create: { ...data, s3_key: key },
      update: { deleted_at: null },
    });
    return "created";
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.image.findUnique({
        where: { s3_key: key },
        select: { id: true, product_id: true, deleted_at: true },
      });
      if (raced) return restoreAndReuse(raced, productId);
      return "reused";
    }
    throw error;
  }
}

/**
 * Link a stored file to a product. Same product + same file reuses the existing
 * row. Duplicate s3_key values never fail the catalog import.
 */
export async function createOrReuseImage(
  data: Prisma.ImageUncheckedCreateInput
): Promise<"created" | "reused"> {
  const key = String(data.s3_key ?? "").trim();
  const pending = inFlightByKey.get(key);
  if (pending) {
    await pending;
    return "reused";
  }
  const run = createOrReuseImageUnlocked(data).finally(() => {
    inFlightByKey.delete(key);
  });
  inFlightByKey.set(key, run);
  return run;
}
