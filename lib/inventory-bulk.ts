import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mergeInventoryAttributes, resolveInventoryAttributes } from "@/lib/inventory-attributes";
import {
  completenessIssueColumn,
  evaluateProductCompleteness,
  evaluateProductRecordCompleteness,
  evaluateVariantCompleteness,
  hasCompletenessFilter,
  matchesCompletenessFilter,
  type CompletenessFilter,
  type CompletenessIssue,
  type CompletenessIssueKind,
  type CompletenessStatus,
} from "@/lib/inventory-completeness";
import {
  normalizeInventoryImages,
  resolveVariantImages,
  type InventoryImage,
} from "@/lib/inventory-crud";
import { slugify } from "@/lib/api-response";
import {
  pushInventoryProductsToTraide,
  pushInventoryVariantsToTraide,
} from "@/lib/traide/services/inventory-bulk-push";

export const BULK_KIND_PRODUCTS = "products";
export const BULK_KIND_VARIANTS = "variants";
export type InventoryBulkKind = typeof BULK_KIND_PRODUCTS | typeof BULK_KIND_VARIANTS;

const DATA_SHEET = "Data";
const INSTRUCTIONS_SHEET = "Instructions";

const LOCKED_FILL = "FFE5E7EB";
const REVIEW_HEADER_FILL = "FFF59E0B";
const REVIEW_CELL_FILL = "FFFFF3CD";
const HEADER_FILL = "FFE8F4F1";

const PRODUCT_LOCKED = ["product_id", "traide_id"] as const;
const PRODUCT_CORE = [
  "Name",
  "Slug",
  "Status",
  "Published",
  "Available for purchase",
  "Category",
  "Type",
  "Description",
  "SEO title",
  "SEO description",
  "Images",
  "Length",
  "Width",
  "Height",
  "Unit",
] as const;

const VARIANT_LOCKED = ["variant_id", "product_id", "product_name", "traide_id"] as const;
const VARIANT_CORE = [
  "Name",
  "SKU",
  "SEO description",
  "Images",
  "Length",
  "Width",
  "Height",
  "Unit",
] as const;

const PRODUCT_LOCKED_SET = new Set<string>(PRODUCT_LOCKED);
const VARIANT_LOCKED_SET = new Set<string>(VARIANT_LOCKED);
const IMPORT_SKIP_HEADERS = new Set([
  ...PRODUCT_LOCKED,
  ...VARIANT_LOCKED,
  "nautical_id",
  "External ID",
]);

export type InventoryBulkImportResult = {
  kind: InventoryBulkKind;
  updated: number;
  skipped: number;
  errors: string[];
  traide_synced: number;
  traide_errors: string[];
};

type ProductRow = Awaited<ReturnType<typeof prisma.inventoryProduct.findMany>>[number];
type VariantRow = Awaited<ReturnType<typeof prisma.inventoryVariant.findMany>>[number];

type LoadedInventory = {
  products: ProductRow[];
  variantsByProduct: Map<number, VariantRow[]>;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function namedValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name ?? "").trim();
  }
  return String(value ?? "").trim();
}

function dimensionValue(dimensions: unknown, key: "length" | "width" | "height" | "unit"): string {
  if (!dimensions || typeof dimensions !== "object") return "";
  const raw = (dimensions as Record<string, unknown>)[key];
  if (raw == null) return "";
  return String(raw).trim();
}

function joinImageUrls(images: InventoryImage[]): string {
  return images.map((image) => String(image.url ?? "").trim()).filter(Boolean).join(" | ");
}

function parseImageUrls(text: string, existing: unknown): Prisma.InputJsonValue {
  const previous = normalizeInventoryImages(existing);
  const urls = text
    .split(/[\n|;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return urls.map((url) => {
    const match = previous.find((image) => image.url === url);
    return match ?? { url };
  });
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseBool(value: string, fallback: boolean): boolean {
  const text = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

function uniqueAttributeNames(items: Array<{ attributes?: unknown; payload?: unknown }>): string[] {
  const names = new Set<string>();
  for (const item of items) {
    for (const attr of resolveInventoryAttributes(item)) {
      if (attr.name) names.add(attr.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function attributeValue(
  item: { attributes?: unknown; payload?: unknown },
  name: string
): string {
  return resolveInventoryAttributes(item).find((attr) => attr.name === name)?.value ?? "";
}

function issueMap(issues: CompletenessIssue[]): Map<string, CompletenessIssue> {
  const map = new Map<string, CompletenessIssue>();
  for (const issue of issues) {
    map.set(completenessIssueColumn(issue.field), issue);
  }
  return map;
}

function excelBuffer(raw: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return Buffer.from(new Uint8Array(raw));
}

async function writeWorkbookBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return excelBuffer(await wb.xlsx.writeBuffer());
}

function addInstructionSheet(wb: ExcelJS.Workbook, kind: InventoryBulkKind) {
  const sheet = wb.addWorksheet(INSTRUCTIONS_SHEET);
  sheet.columns = [
    { width: 28 },
    { width: 88 },
  ];
  const rows: Array<[string, string]> = [
    ["Kind", kind],
    ["Data sheet", DATA_SHEET],
    [
      "Relationship",
      kind === BULK_KIND_VARIANTS
        ? "Keep variant_id, product_id, and traide_id unchanged. Each variant stays grouped under its parent product."
        : "Keep product_id and traide_id unchanged. Variants stay linked through product_id even if you edit variants in a separate file.",
    ],
    ["Gray columns", "Locked. Do not edit product_id, variant_id, or traide_id."],
    ["Orange headers", "This column has completeness issues (empty, N/A, zero, or short text) in at least one row."],
    ["Yellow cells", "This value needs review, matching the completeness report in inventory."],
    ["Attributes", "Each attribute name is its own column header."],
    ["Images", "Separate multiple URLs with |"],
    ["Upload", "Use Bulk upload on the inventory page. Do not rename the Data sheet or header row."],
  ];
  sheet.addRow(["Bulk edit", kind === BULK_KIND_VARIANTS ? "Variants" : "Products"]).font = { bold: true };
  sheet.addRow([]);
  for (const [label, value] of rows) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.height = 28;
  }
}

function styleHeaderRow(row: ExcelJS.Row, headers: string[], locked: Set<string>, reviewColumns: Set<string>) {
  row.font = { bold: true };
  row.height = 22;
  row.eachCell((cell, colNumber) => {
    const header = headers[colNumber - 1] ?? "";
    if (locked.has(header)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LOCKED_FILL } };
      cell.note = "Locked. Do not change. Required to keep the product/variant relationship.";
      return;
    }
    if (reviewColumns.has(header)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REVIEW_HEADER_FILL } };
      cell.font = { bold: true, color: { argb: "FF7C2D12" } };
      cell.note = "Needs review: one or more rows have completeness issues in this column.";
      return;
    }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
}

function paintReviewCell(cell: ExcelJS.Cell, issue: CompletenessIssue | undefined) {
  if (!issue) return;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REVIEW_CELL_FILL } };
  cell.note = issue.message;
}

function columnWidth(header: string): number {
  if (header === "Description" || header === "SEO description" || header === "Images") return 36;
  if (header.endsWith("_id") || header === "traide_id") return 16;
  return Math.min(28, Math.max(14, header.length + 2));
}

async function loadInventory(
  manufacturerId: number,
  filter: CompletenessFilter & { search?: string }
): Promise<LoadedInventory> {
  const where: Prisma.InventoryProductWhereInput = {
    manufacturer_id: manufacturerId,
    deleted_at: null,
  };
  const search = filter.search?.trim() ?? "";
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { external_id: { contains: search, mode: "insensitive" } },
      { status: { contains: search, mode: "insensitive" } },
      {
        variants: {
          some: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const products = await prisma.inventoryProduct.findMany({
    where,
    orderBy: { name: "asc" },
  });
  const productIds = products.map((row) => row.id);
  const variants = productIds.length
    ? await prisma.inventoryVariant.findMany({
        where: { inventory_product_id: { in: productIds } },
        orderBy: [{ inventory_product_id: "asc" }, { sku: "asc" }, { name: "asc" }],
      })
    : [];
  const variantsByProduct = new Map<number, VariantRow[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.inventory_product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.inventory_product_id, list);
  }

  if (!hasCompletenessFilter(filter)) {
    return { products, variantsByProduct };
  }

  const filtered = products.filter((product) => {
    const report = evaluateProductCompleteness(product, variantsByProduct.get(product.id) ?? []);
    return matchesCompletenessFilter(report, filter);
  });
  const allowed = new Set(filtered.map((product) => product.id));
  const nextVariants = new Map<number, VariantRow[]>();
  for (const [id, list] of variantsByProduct) {
    if (allowed.has(id)) nextVariants.set(id, list);
  }
  return { products: filtered, variantsByProduct: nextVariants };
}

export async function exportInventoryWorkbook(
  manufacturerId: number,
  kind: InventoryBulkKind,
  filter: CompletenessFilter & { search?: string }
): Promise<{ buffer: Buffer; filename: string }> {
  const loaded = await loadInventory(manufacturerId, filter);
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === BULK_KIND_VARIANTS) {
    return {
      buffer: await buildVariantWorkbook(loaded),
      filename: `inventory-variants-${stamp}.xlsx`,
    };
  }
  return {
    buffer: await buildProductWorkbook(loaded),
    filename: `inventory-products-${stamp}.xlsx`,
  };
}

async function buildProductWorkbook(loaded: LoadedInventory): Promise<Buffer> {
  const attrNames = uniqueAttributeNames(loaded.products);
  const headers = [...PRODUCT_LOCKED, ...PRODUCT_CORE, ...attrNames];
  const reviewColumns = new Set<string>();
  const wb = new ExcelJS.Workbook();
  wb.creator = "OONNI inventory";
  wb.created = new Date();
  addInstructionSheet(wb, BULK_KIND_PRODUCTS);

  const data = wb.addWorksheet(DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = headers.map((header) => ({ header, width: columnWidth(header) }));

  for (const product of loaded.products) {
    const report = evaluateProductRecordCompleteness(product);
    const issues = issueMap(report.issues);
    for (const header of issues.keys()) reviewColumns.add(header);
    const images = joinImageUrls(normalizeInventoryImages(product.images));
    const values = [
      product.id,
      product.nautical_id,
      product.name ?? "",
      product.slug ?? "",
      product.status ?? "",
      product.is_published ? "TRUE" : "FALSE",
      product.available_for_purchase ? "TRUE" : "FALSE",
      namedValue(product.category),
      namedValue(product.product_type),
      product.description ?? "",
      product.seo_title ?? "",
      product.seo_description ?? "",
      images,
      dimensionValue(product.dimensions, "length"),
      dimensionValue(product.dimensions, "width"),
      dimensionValue(product.dimensions, "height"),
      dimensionValue(product.dimensions, "unit") || "in",
      ...attrNames.map((name) => attributeValue(product, name)),
    ];
    const row = data.addRow(values);
    headers.forEach((header, index) => paintReviewCell(row.getCell(index + 1), issues.get(header)));
  }

  styleHeaderRow(data.getRow(1), headers, PRODUCT_LOCKED_SET, reviewColumns);
  return writeWorkbookBuffer(wb);
}

async function buildVariantWorkbook(loaded: LoadedInventory): Promise<Buffer> {
  const allVariants: Array<{ variant: VariantRow; product: ProductRow }> = [];
  for (const product of loaded.products) {
    for (const variant of loaded.variantsByProduct.get(product.id) ?? []) {
      allVariants.push({ variant, product });
    }
  }
  const attrNames = uniqueAttributeNames(allVariants.map((row) => row.variant));
  const headers = [...VARIANT_LOCKED, ...VARIANT_CORE, ...attrNames];
  const reviewColumns = new Set<string>();
  const wb = new ExcelJS.Workbook();
  wb.creator = "OONNI inventory";
  wb.created = new Date();
  addInstructionSheet(wb, BULK_KIND_VARIANTS);

  const data = wb.addWorksheet(DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = headers.map((header) => ({ header, width: columnWidth(header) }));

  for (const { variant, product } of allVariants) {
    const report = evaluateVariantCompleteness(variant, product.payload, product.images);
    const issues = issueMap(report.issues);
    for (const header of issues.keys()) reviewColumns.add(header);
    const images = joinImageUrls(resolveVariantImages(variant, product.payload, product.images));
    const values = [
      variant.id,
      product.id,
      product.name ?? "",
      variant.nautical_id,
      variant.name ?? "",
      variant.sku ?? "",
      variant.seo_description ?? "",
      images,
      dimensionValue(variant.dimensions, "length"),
      dimensionValue(variant.dimensions, "width"),
      dimensionValue(variant.dimensions, "height"),
      dimensionValue(variant.dimensions, "unit") || "in",
      ...attrNames.map((name) => attributeValue(variant, name)),
    ];
    const row = data.addRow(values);
    headers.forEach((header, index) => paintReviewCell(row.getCell(index + 1), issues.get(header)));
  }

  styleHeaderRow(data.getRow(1), headers, VARIANT_LOCKED_SET, reviewColumns);
  return writeWorkbookBuffer(wb);
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in (value as { text?: unknown })) {
    return String((value as { text?: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && "result" in (value as { result?: unknown })) {
    return String((value as { result?: unknown }).result ?? "").trim();
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).trim();
}

function readSheetMatrix(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellText(cell.value);
    });
    if (rowNumber === 1 || values.some((value) => value)) rows.push(values);
  });
  return rows;
}

function headerIndex(headers: string[], name: string): number {
  const needle = name.trim().toLowerCase();
  return headers.findIndex((header) => header.trim().toLowerCase() === needle);
}

function detectKind(wb: ExcelJS.Workbook, headers: string[]): InventoryBulkKind {
  const instructions = wb.getWorksheet(INSTRUCTIONS_SHEET);
  if (instructions) {
    const kindCell = cellText(instructions.getCell("B1").value).toLowerCase();
    if (kindCell.includes("variant")) return BULK_KIND_VARIANTS;
    if (kindCell.includes("product")) return BULK_KIND_PRODUCTS;
  }
  if (headerIndex(headers, "variant_id") >= 0) return BULK_KIND_VARIANTS;
  return BULK_KIND_PRODUCTS;
}

function mergeAttributes(
  existing: unknown,
  headers: string[],
  values: string[],
  core: Set<string>
): Prisma.InputJsonValue {
  const current = resolveInventoryAttributes({ attributes: existing }).map((attr) => ({
    name: attr.name,
    value: attr.value,
    id: attr.id,
    slug: attr.slug,
    inputType: attr.inputType,
  }));
  headers.forEach((header, index) => {
    if (!header || core.has(header) || IMPORT_SKIP_HEADERS.has(header)) return;
    const nextValue = values[index] ?? "";
    const prev = current.find((attr) => attr.name === header);
    if (prev) prev.value = nextValue;
    else current.push({ name: header, value: nextValue, id: null, slug: null, inputType: null });
  });
  return asJson(mergeInventoryAttributes(existing, current));
}

function mergeNamedEntity(existing: unknown, name: string): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!name.trim()) return Prisma.JsonNull;
  const prev =
    existing && typeof existing === "object" ? (existing as Record<string, unknown>) : null;
  if (prev && String(prev.name ?? "").trim().toLowerCase() === name.trim().toLowerCase()) {
    return asJson(prev);
  }
  return asJson({ ...(prev ?? {}), name: name.trim() });
}

function dimensionsFromRow(
  values: string[],
  headers: string[],
  existing: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const length = parseNumber(values[headerIndex(headers, "Length")] ?? "");
  const width = parseNumber(values[headerIndex(headers, "Width")] ?? "");
  const height = parseNumber(values[headerIndex(headers, "Height")] ?? "");
  const unit =
    (values[headerIndex(headers, "Unit")] ?? "").trim() ||
    dimensionValue(existing, "unit") ||
    "in";
  if (length == null && width == null && height == null && !(values[headerIndex(headers, "Unit")] ?? "").trim()) {
    if (!existing) return Prisma.JsonNull;
    return asJson(existing);
  }
  return { length, width, height, unit };
}

function col(values: string[], headers: string[], name: string): string {
  const index = headerIndex(headers, name);
  return index >= 0 ? values[index] ?? "" : "";
}

function hasCol(headers: string[], name: string): boolean {
  return headerIndex(headers, name) >= 0;
}

function optionalText(headers: string[], values: string[], name: string, fallback: string | null): string | null {
  if (!hasCol(headers, name)) return fallback;
  return col(values, headers, name) || null;
}

export async function importInventoryWorkbook(
  manufacturerId: number,
  file: Buffer,
  requestedKind?: InventoryBulkKind
): Promise<InventoryBulkImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);
  const data = wb.getWorksheet(DATA_SHEET) ?? wb.worksheets.find((sheet) => sheet.name !== INSTRUCTIONS_SHEET);
  if (!data) throw new Error("The spreadsheet has no Data sheet.");
  const matrix = readSheetMatrix(data);
  const headers = (matrix[0] ?? []).map((header) => header.trim());
  if (!headers.length) throw new Error("The spreadsheet is missing a header row.");
  const kind = requestedKind ?? detectKind(wb, headers);
  const rows = matrix.slice(1);
  if (kind === BULK_KIND_VARIANTS) return applyVariantRows(manufacturerId, headers, rows);
  return applyProductRows(manufacturerId, headers, rows);
}

async function applyProductRows(
  manufacturerId: number,
  headers: string[],
  rows: string[][]
): Promise<InventoryBulkImportResult> {
  const idIndex = headerIndex(headers, "product_id");
  if (idIndex < 0) throw new Error("Products file must include product_id. Download products again and do not remove that column.");
  const core = new Set<string>([...PRODUCT_LOCKED, ...PRODUCT_CORE]);
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updatedIds: number[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const values = rows[i];
    const line = i + 2;
    const productId = parseInt(values[idIndex] ?? "", 10);
    if (!Number.isFinite(productId) || productId < 1) {
      skipped += 1;
      errors.push(`Row ${line}: missing product_id`);
      continue;
    }
    const existing = await prisma.inventoryProduct.findFirst({
      where: { id: productId, manufacturer_id: manufacturerId, deleted_at: null },
    });
    if (!existing) {
      skipped += 1;
      errors.push(`Row ${line}: product ${productId} was not found`);
      continue;
    }
    const name = hasCol(headers, "Name") ? col(values, headers, "Name") || existing.name : existing.name;
    if (!name.trim()) {
      skipped += 1;
      errors.push(`Row ${line}: Name is required`);
      continue;
    }
    const isPublished = hasCol(headers, "Published")
      ? parseBool(col(values, headers, "Published"), existing.is_published)
      : existing.is_published;
    try {
      await prisma.inventoryProduct.update({
        where: { id: existing.id },
        data: {
          name: name.slice(0, 500),
          slug: hasCol(headers, "Slug")
            ? (slugify(col(values, headers, "Slug") || name) || existing.slug).slice(0, 255)
            : existing.slug,
          status: hasCol(headers, "Status")
            ? col(values, headers, "Status") || (isPublished ? "PUBLISHED" : "DRAFT")
            : existing.status,
          is_published: isPublished,
          available_for_purchase: hasCol(headers, "Available for purchase")
            ? parseBool(col(values, headers, "Available for purchase"), existing.available_for_purchase)
            : existing.available_for_purchase,
          category: hasCol(headers, "Category")
            ? mergeNamedEntity(existing.category, col(values, headers, "Category"))
            : undefined,
          product_type: hasCol(headers, "Type")
            ? mergeNamedEntity(existing.product_type, col(values, headers, "Type"))
            : undefined,
          description: optionalText(headers, values, "Description", existing.description),
          seo_title: optionalText(headers, values, "SEO title", existing.seo_title),
          seo_description: optionalText(headers, values, "SEO description", existing.seo_description),
          images: hasCol(headers, "Images")
            ? parseImageUrls(col(values, headers, "Images"), existing.images)
            : undefined,
          dimensions: dimensionsFromRow(values, headers, existing.dimensions),
          attributes: mergeAttributes(existing.attributes, headers, values, core),
        },
      });
      updated += 1;
      updatedIds.push(existing.id);
    } catch (e) {
      skipped += 1;
      errors.push(`Row ${line}: ${e instanceof Error ? e.message : "failed to update product"}`);
    }
  }

  const traide = await pushInventoryProductsToTraide(manufacturerId, updatedIds);
  return {
    kind: BULK_KIND_PRODUCTS,
    updated,
    skipped,
    errors: [...errors, ...traide.traide_errors].slice(0, 50),
    traide_synced: traide.traide_synced,
    traide_errors: traide.traide_errors,
  };
}

async function applyVariantRows(
  manufacturerId: number,
  headers: string[],
  rows: string[][]
): Promise<InventoryBulkImportResult> {
  const variantIdIndex = headerIndex(headers, "variant_id");
  const productIdIndex = headerIndex(headers, "product_id");
  if (variantIdIndex < 0 || productIdIndex < 0) {
    throw new Error(
      "Variants file must include variant_id and product_id. Download variants again and do not remove those columns."
    );
  }
  const core = new Set<string>([...VARIANT_LOCKED, ...VARIANT_CORE]);
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updatedIds: number[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const values = rows[i];
    const line = i + 2;
    const variantId = parseInt(values[variantIdIndex] ?? "", 10);
    const productId = parseInt(values[productIdIndex] ?? "", 10);
    if (!Number.isFinite(variantId) || variantId < 1 || !Number.isFinite(productId) || productId < 1) {
      skipped += 1;
      errors.push(`Row ${line}: missing variant_id or product_id`);
      continue;
    }
    const product = await prisma.inventoryProduct.findFirst({
      where: { id: productId, manufacturer_id: manufacturerId, deleted_at: null },
      select: { id: true, name: true },
    });
    if (!product) {
      skipped += 1;
      errors.push(`Row ${line}: parent product ${productId} was not found`);
      continue;
    }
    const existing = await prisma.inventoryVariant.findFirst({
      where: { id: variantId },
    });
    if (!existing) {
      skipped += 1;
      errors.push(`Row ${line}: variant ${variantId} was not found`);
      continue;
    }
    if (existing.inventory_product_id !== product.id) {
      skipped += 1;
      errors.push(
        `Row ${line}: variant ${variantId} belongs to product ${existing.inventory_product_id}, not ${productId}. The parent relationship cannot be changed.`
      );
      continue;
    }
    const name = hasCol(headers, "Name") ? col(values, headers, "Name") || existing.name : existing.name;
    if (!name.trim()) {
      skipped += 1;
      errors.push(`Row ${line}: Name is required`);
      continue;
    }
    try {
      await prisma.inventoryVariant.update({
        where: { id: existing.id },
        data: {
          name: name.slice(0, 500),
          sku: hasCol(headers, "SKU") ? col(values, headers, "SKU") || null : existing.sku,
          seo_description: optionalText(headers, values, "SEO description", existing.seo_description),
          dimensions: dimensionsFromRow(values, headers, existing.dimensions),
          attributes: mergeAttributes(existing.attributes, headers, values, core),
        },
      });
      if (hasCol(headers, "Images")) {
        const images = parseImageUrls(col(values, headers, "Images"), existing.images);
        await prisma.$executeRawUnsafe(
          `UPDATE inventory_variants SET images = $1::jsonb WHERE id = $2`,
          JSON.stringify(images),
          existing.id
        );
      }
      updated += 1;
      updatedIds.push(existing.id);
    } catch (e) {
      skipped += 1;
      errors.push(`Row ${line}: ${e instanceof Error ? e.message : "failed to update variant"}`);
    }
  }

  const traide = await pushInventoryVariantsToTraide(manufacturerId, updatedIds);
  return {
    kind: BULK_KIND_VARIANTS,
    updated,
    skipped,
    errors: [...errors, ...traide.traide_errors].slice(0, 50),
    traide_synced: traide.traide_synced,
    traide_errors: traide.traide_errors,
  };
}

export function parseCompletenessQuery(searchParams: URLSearchParams): CompletenessFilter & { search?: string } {
  const completenessStatus = String(searchParams.get("completeness") ?? "").trim() as CompletenessStatus | "";
  const issueKinds = String(searchParams.get("issues") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(
      (value): value is CompletenessIssueKind =>
        value === "empty" || value === "na" || value === "zero" || value === "short"
    );
  return {
    search: String(searchParams.get("search") ?? "").trim() || undefined,
    status:
      completenessStatus === "complete" ||
      completenessStatus === "needs_review" ||
      completenessStatus === "incomplete"
        ? completenessStatus
        : "",
    issues: issueKinds,
  };
}
