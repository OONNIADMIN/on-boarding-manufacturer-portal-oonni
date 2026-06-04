import Papa from "papaparse";
import * as XLSX from "xlsx";

export const MAX_HEADER_PREVIEW_ROWS = 20;

function fileExtension(fileName: string): string {
  return "." + fileName.split(".").pop()?.toLowerCase();
}

function decodeUtf8(bytes: ArrayBuffer | Buffer): string {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)) {
    return bytes.toString("utf8");
  }
  return new TextDecoder().decode(bytes as ArrayBuffer);
}

function readWorkbook(bytes: ArrayBuffer | Buffer) {
  const type = typeof Buffer !== "undefined" && Buffer.isBuffer(bytes) ? "buffer" : "array";
  return XLSX.read(bytes, { type });
}

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeRow(row: unknown[]): string[] {
  return row.map((cell) => normalizeCell(cell));
}

/** Parse all rows from CSV or Excel as string arrays (no header assumption). */
export function parseSpreadsheetRows(bytes: ArrayBuffer | Buffer, fileName: string): string[][] {
  const ext = fileExtension(fileName);

  if (ext === ".csv") {
    const text = decodeUtf8(bytes);
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: "greedy",
    });
    return (parsed.data ?? []).map((row) => normalizeRow(row));
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = readWorkbook(bytes);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    return rows.map((row) => normalizeRow(row ?? []));
  }

  return [];
}

export function extractColumnNamesFromRows(rows: string[][], headerRowIndex: number): string[] {
  const headerRow = rows[headerRowIndex];
  if (!headerRow) return [];
  return headerRow.map((cell) => normalizeCell(cell)).filter(Boolean);
}

export function extractColumnNamesFromBytes(
  bytes: ArrayBuffer | Buffer,
  fileName: string,
  headerRowIndex = 0
): string[] {
  const rows = parseSpreadsheetRows(bytes, fileName);
  return extractColumnNamesFromRows(rows, headerRowIndex);
}

export function rowsToObjects(rows: string[][], headerRowIndex: number): Record<string, unknown>[] {
  const headers = extractColumnNamesFromRows(rows, headerRowIndex);
  if (!headers.length) return [];

  const objects: Record<string, unknown>[] = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const record: Record<string, unknown> = {};
    let hasValue = false;

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      if (!header) continue;
      const raw = row[colIndex] ?? "";
      const value = normalizeCell(raw);
      if (value) hasValue = true;
      record[header] = value || null;
    }

    if (hasValue) objects.push(record);
  }

  return objects;
}

export function countDataRows(rows: string[][], headerRowIndex: number): number {
  return rowsToObjects(rows, headerRowIndex).length;
}

export async function parseSpreadsheetPreviewFromFile(
  file: File,
  maxRows = MAX_HEADER_PREVIEW_ROWS
): Promise<string[][]> {
  const bytes = await file.arrayBuffer();
  return parseSpreadsheetRows(bytes, file.name).slice(0, maxRows);
}

export async function extractColumnNamesFromFile(file: File, headerRowIndex = 0): Promise<string[]> {
  const bytes = await file.arrayBuffer();
  return extractColumnNamesFromBytes(bytes, file.name, headerRowIndex);
}
