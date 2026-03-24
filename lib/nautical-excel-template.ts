import ExcelJS from "exceljs";

const SAMPLE_ROW_COUNT = 3;
const CATEGORY_SHEET = "Categories";
const CATALOG_SHEET = "Catalog";
const DATA_VALIDATION_MAX_ROW = 500;

function excelColLetter(zeroBased: number): string {
  let n = zeroBased + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function normalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Flat sample rows for manufacturer testing (Category left empty for dropdown). */
export function buildSampleDataRows(headers: string[], rowCount: number): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const idx = i + 1;
    const row = headers.map((h) => {
      const k = normalizeHeaderKey(h);
      if (k === "sku") return `SAMPLE-SKU-${idx}`;
      if (k === "category") return "";
      if (k === "price" || k === "cost price" || k === "cost_price") return idx === 1 ? 19.99 : "";
      if (k.includes("price")) return idx === 1 ? 24.99 : "";
      if (k === "product name" || k === "product_name") return `Sample product ${idx}`;
      if (k === "product description" || k === "product_description")
        return `Short demo description for row ${idx}.`;
      if (k === "short description" || k === "short_description")
        return `Sample short text ${idx}`;
      if (k === "images") return `https://example.com/sample-image-${idx}.jpg`;
      if (k === "height" || k === "length" || k === "width" || k === "weight")
        return idx === 1 ? 10 : "";
      if (k === "varaint name" || k === "variant name" || k === "varaint_name")
        return `Variant ${idx}`;
      if (k === "variant description" || k === "variant_description")
        return `Variant notes ${idx}`;
      if (k === "country of origin" || k === "country_of_origin") return "";
      return "";
    });
    rows.push(row);
  }
  return rows;
}

export type CategoryTreeRow = {
  /** e.g. "Tools > Power tools > Drills" */
  path: string;
  slug: string;
  level: number;
};

export async function buildNauticalCatalogExcelBuffer(params: {
  headers: string[];
  categoryRows: CategoryTreeRow[];
  /** Nautical product type name (used only for a note row). */
  templateName: string;
}): Promise<Buffer> {
  const { headers, categoryRows, templateName } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Oonni Onboarding";
  wb.created = new Date();

  const catalog = wb.addWorksheet(CATALOG_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  catalog.addRow(headers);
  const headerRow = catalog.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F4F1" },
  };

  const categoryColIndex = headers.findIndex((h) => normalizeHeaderKey(h) === "category");
  const samples = buildSampleDataRows(headers, SAMPLE_ROW_COUNT);
  if (categoryColIndex >= 0 && categoryRows.length > 0 && samples[0]) {
    samples[0][categoryColIndex] = categoryRows[0].path;
  }
  for (const r of samples) {
    catalog.addRow(r);
  }

  const categoryColLetter =
    categoryColIndex >= 0 ? excelColLetter(categoryColIndex) : null;

  const catWs = wb.addWorksheet(CATEGORY_SHEET);
  catWs.addRow(["Path (category tree)", "Slug", "Level"]);
  const catHeader = catWs.getRow(1);
  catHeader.font = { bold: true };
  catHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F5F5" },
  };

  catWs.getColumn(1).width = 48;
  catWs.getColumn(2).width = 28;
  catWs.getColumn(3).width = 8;

  for (const c of categoryRows) {
    catWs.addRow([c.path, c.slug, c.level]);
  }

  catWs.addRow([]);
  catWs.addRow([`Template filter: "${templateName}"`, "", ""]);

  const listStartRow = 2;
  const listEndRow = Math.max(listStartRow, 1 + categoryRows.length);

  if (categoryColLetter && categoryRows.length > 0) {
    const range = `'${CATEGORY_SHEET}'!$A$${listStartRow}:$A$${listEndRow}`;
    for (let r = 2; r <= DATA_VALIDATION_MAX_ROW; r++) {
      catalog.getCell(`${categoryColLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Category",
        error: "Choose a category path from the list (see Categories sheet).",
      };
    }
  }

  const raw = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return Buffer.from(new Uint8Array(raw as ArrayBuffer));
}
