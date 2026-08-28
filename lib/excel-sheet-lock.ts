import type ExcelJS from "exceljs";

const SHEET_PROTECT_OPTIONS = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: true,
  formatColumns: true,
  formatRows: true,
  insertRows: false,
  insertColumns: false,
  deleteRows: false,
  deleteColumns: false,
  sort: false,
  autoFilter: false,
};

/**
 * Excel only honors cell.protection.locked after the sheet is protected.
 * Header row stays locked; locked columns stay locked on every row; other data cells can be edited.
 */
export async function lockExcelSheetForBulkEdit(
  sheet: ExcelJS.Worksheet,
  options: {
    columnCount: number;
    lockedColumnIndexes: number[];
    headerRow?: number;
  }
): Promise<void> {
  const headerRow = options.headerRow ?? 1;
  const lockedCols = new Set(options.lockedColumnIndexes.filter((index) => index >= 1));
  const columnCount = Math.max(0, options.columnCount);

  const header = sheet.getRow(headerRow);
  for (let col = 1; col <= columnCount; col++) {
    header.getCell(col).protection = { locked: true };
  }

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === headerRow) return;
    for (let col = 1; col <= columnCount; col++) {
      row.getCell(col).protection = { locked: lockedCols.has(col) };
    }
  });

  await sheet.protect("", SHEET_PROTECT_OPTIONS);
}
