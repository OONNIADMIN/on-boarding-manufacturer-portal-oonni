import { prisma } from "@/lib/db";
import { imageKitFileExists } from "@/lib/imagekit";

const CHECK_CONCURRENCY = 8;

async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index];
        if (item !== undefined) await worker(item);
      }
    })
  );
}

/**
 * Soft-delete local image rows whose ImageKit file was removed in the Media Library.
 * Leaves rows untouched when ImageKit cannot be reached.
 */
export async function hideImagesMissingFromImageKit(
  images: Array<{ id: number; imagekit_file_id: string | null }>
): Promise<number> {
  const missingIds: number[] = [];

  await mapPool(images, CHECK_CONCURRENCY, async (image) => {
    const fileId = image.imagekit_file_id?.trim();
    if (!fileId) return;
    const exists = await imageKitFileExists(fileId);
    if (exists === false) missingIds.push(image.id);
  });

  if (!missingIds.length) return 0;

  await prisma.image.updateMany({
    where: { id: { in: missingIds }, deleted_at: null },
    data: { deleted_at: new Date() },
  });
  return missingIds.length;
}
