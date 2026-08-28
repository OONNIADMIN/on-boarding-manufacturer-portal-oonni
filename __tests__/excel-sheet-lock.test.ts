import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import { lockExcelSheetForBulkEdit } from "@/lib/excel-sheet-lock";

describe("excel sheet header lock", () => {
  test("locks every header and ID column, but keeps other values editable", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Data");
    sheet.columns = [
      { header: "product_id", width: 14 },
      { header: "Name", width: 20 },
      { header: "Brand", width: 16 },
    ];
    sheet.addRow([12, "Chair", "Acme"]);

    await lockExcelSheetForBulkEdit(sheet, {
      columnCount: 3,
      lockedColumnIndexes: [1],
    });

    const header = sheet.getRow(1);
    expect(header.getCell(1).protection?.locked).toBe(true);
    expect(header.getCell(2).protection?.locked).toBe(true);
    expect(header.getCell(3).protection?.locked).toBe(true);

    const data = sheet.getRow(2);
    expect(data.getCell(1).protection?.locked).toBe(true);
    expect(data.getCell(2).protection?.locked).toBe(false);
    expect(data.getCell(3).protection?.locked).toBe(false);
  });
});
