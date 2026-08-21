import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAllNauticalCategories } from "@/lib/traide/operations/categories";
import { flattenStoredCategoryTree, type StoredCategoryRow } from "@/lib/inventory-categories";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

const UPSERT_CHUNK = 50;

export type CategorySyncResult = {
  synced: number;
  removed: number;
};

export async function syncTraideCategories(): Promise<CategorySyncResult> {
  const records = await fetchAllNauticalCategories();
  const now = new Date();
  const seen = records.map((row) => row.id);

  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const chunk = records.slice(i, i + UPSERT_CHUNK);
    await Promise.all(
      chunk.map((row) =>
        prisma.traideCategory.upsert({
          where: { nautical_id: row.id },
          create: {
            nautical_id: row.id,
            parent_nautical_id: row.parent_id && row.parent_id !== row.id ? row.parent_id : null,
            name: row.name.slice(0, 500) || row.slug || row.id,
            slug: (row.slug || row.id).slice(0, 255),
            metadata: asJson(row.metadata),
            custom_fields: asJson(row.custom_fields),
            payload: asJson(row.payload),
            synced_at: now,
            deleted_at: null,
          },
          update: {
            parent_nautical_id: row.parent_id && row.parent_id !== row.id ? row.parent_id : null,
            name: row.name.slice(0, 500) || row.slug || row.id,
            slug: (row.slug || row.id).slice(0, 255),
            metadata: asJson(row.metadata),
            custom_fields: asJson(row.custom_fields),
            payload: asJson(row.payload),
            synced_at: now,
            deleted_at: null,
          },
        })
      )
    );
  }

  const stored = await prisma.traideCategory.findMany({
    select: { id: true, nautical_id: true, parent_id: true, parent_nautical_id: true },
  });
  const byNauticalId = new Map(stored.map((row) => [row.nautical_id, row]));

  await Promise.all(
    stored.map((row) => {
      const parent =
        row.parent_nautical_id && row.parent_nautical_id !== row.nautical_id
          ? byNauticalId.get(row.parent_nautical_id)
          : undefined;
      const nextParentId = parent?.id ?? null;
      if (nextParentId === row.parent_id) return Promise.resolve();
      return prisma.traideCategory.update({
        where: { id: row.id },
        data: { parent_id: nextParentId },
      });
    })
  );

  let removed = 0;
  if (seen.length) {
    const result = await prisma.traideCategory.updateMany({
      where: { nautical_id: { notIn: seen }, deleted_at: null },
      data: { deleted_at: now },
    });
    removed = result.count;
  }

  return { synced: records.length, removed };
}

export async function listStoredCategoryTree(): Promise<ReturnType<typeof flattenStoredCategoryTree>> {
  const rows: StoredCategoryRow[] = await prisma.traideCategory.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      nautical_id: true,
      parent_id: true,
      name: true,
      slug: true,
    },
    orderBy: { name: "asc" },
  });
  return flattenStoredCategoryTree(rows);
}
