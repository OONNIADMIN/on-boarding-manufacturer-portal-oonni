import { prisma } from "@/lib/db";
import { parseSpreadsheetRows, rowsToObjects } from "@/lib/catalog-file-headers";

export type CreateProductsFromSpreadsheetResult = {
  total_skus: number;
  total_requested: number;
  created: number;
  created_count: number;
  skipped: number;
};

export async function createProductsFromCatalogSpreadsheet(params: {
  buffer: Buffer;
  fileName: string;
  headerRowIndex: number;
  skuColumn: string;
  catalogId: number;
  manufacturerId: number;
}): Promise<CreateProductsFromSpreadsheetResult> {
  const allRows = parseSpreadsheetRows(params.buffer, params.fileName);
  const rows = rowsToObjects(allRows, params.headerRowIndex);

  const skus = [
    ...new Set(rows.map((r) => String(r[params.skuColumn] ?? "").trim()).filter(Boolean)),
  ];

  let created = 0;
  let skipped = 0;

  for (const sku of skus) {
    const exists = await prisma.product.findFirst({
      where: {
        sku,
        manufacturer_id: params.manufacturerId,
        deleted_at: null,
      },
    });
    if (exists) {
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        sku,
        manufacturer_id: params.manufacturerId,
        catalog_id: params.catalogId,
      },
    });
    created++;
  }

  return {
    total_skus: skus.length,
    total_requested: skus.length,
    created,
    created_count: created,
    skipped,
  };
}
