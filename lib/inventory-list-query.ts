import { Prisma } from "@prisma/client";

export function inventorySearchOr(
  search: string
): Prisma.InventoryProductWhereInput["OR"] | undefined {
  const q = search.trim();
  if (!q) return undefined;
  return [
    { name: { contains: q, mode: "insensitive" } },
    { slug: { contains: q, mode: "insensitive" } },
    { external_id: { contains: q, mode: "insensitive" } },
    { status: { contains: q, mode: "insensitive" } },
    {
      variants: {
        some: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    },
  ];
}

export function inventoryOrderBy(
  sort: string,
  order: string
): Prisma.InventoryProductOrderByWithRelationInput {
  const dir = order === "desc" ? "desc" : "asc";
  if (sort === "external_id") return { external_id: dir };
  if (sort === "status") return { status: dir };
  return { name: dir };
}
