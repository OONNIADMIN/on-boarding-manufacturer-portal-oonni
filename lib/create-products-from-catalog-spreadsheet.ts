import { prisma } from "@/lib/db";
import {
  extractColumnNamesFromRows,
  fillMissingSkuHeader,
  parseSpreadsheetRows,
  rowsToObjects,
} from "@/lib/catalog-file-headers";
import { resolveSkuColumn } from "@/lib/catalog-column-detection";
import { listCatalogColumnRules } from "@/lib/catalog-column-rules-service";
import type { CatalogColumnRuleRecord } from "@/lib/catalog-column-validation";

export type CreateProductsFromSpreadsheetResult = {
  total_skus: number;
  total_requested: number;
  created: number;
  created_count: number;
  skipped: number;
  reused_count: number;
};

const PRODUCT_BATCH = 75;

export async function createProductsFromCatalogSpreadsheet(params: {
  buffer: Buffer;
  fileName: string;
  headerRowIndex: number;
  skuColumn?: string | null;
  columnRules?: CatalogColumnRuleRecord[];
  catalogId: number;
  manufacturerId: number;
  onProgress?: (current: number, total: number) => void | Promise<void>;
}): Promise<CreateProductsFromSpreadsheetResult> {
  const allRows = parseSpreadsheetRows(params.buffer, params.fileName);
  fillMissingSkuHeader(allRows, params.headerRowIndex);
  const columnNames = extractColumnNamesFromRows(allRows, params.headerRowIndex);
  const columnRules =
    params.columnRules ?? (await listCatalogColumnRules({ activeOnly: true }).catch(() => []));
  const skuColumn = resolveSkuColumn(columnNames, {
    preferred: params.skuColumn,
    rules: columnRules,
  });
  if (!skuColumn) {
    return {
      total_skus: 0,
      total_requested: 0,
      created: 0,
      created_count: 0,
      skipped: 0,
      reused_count: 0,
    };
  }
  const rows = rowsToObjects(allRows, params.headerRowIndex);

  const skus = [
    ...new Set(rows.map((r) => String(r[skuColumn] ?? "").trim()).filter(Boolean)),
  ];

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < skus.length; i += PRODUCT_BATCH) {
    const chunk = skus.slice(i, i + PRODUCT_BATCH);
    const existing = await prisma.product.findMany({
      where: {
        manufacturer_id: params.manufacturerId,
        deleted_at: null,
        sku: { in: chunk },
      },
      select: { sku: true },
    });
    const have = new Set(existing.map((row) => row.sku));
    const toCreate = chunk.filter((sku) => !have.has(sku));
    skipped += chunk.length - toCreate.length;

    if (toCreate.length) {
      await prisma.product.createMany({
        data: toCreate.map((sku) => ({
          sku,
          manufacturer_id: params.manufacturerId,
          catalog_id: params.catalogId,
        })),
      });
      created += toCreate.length;
    }

    await params.onProgress?.(Math.min(i + chunk.length, skus.length), skus.length);
  }

  return {
    total_skus: skus.length,
    total_requested: skus.length,
    created,
    created_count: created,
    skipped,
    reused_count: skipped,
  };
}
