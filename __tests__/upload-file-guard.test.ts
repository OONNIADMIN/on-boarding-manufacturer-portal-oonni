import { describe, expect, test } from "vitest";
import {
  imageUploadMeta,
  lastFileExtension,
  safeUploadFileName,
  sniffImageKind,
  sniffSpreadsheetKind,
} from "@/lib/upload-file-guard";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00]);
const CSV = Buffer.from("sku,name\nA1,Widget\n", "utf8");
const HTML = Buffer.from("<!doctype html><html><body>ok</body></html>", "utf8");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");

describe("upload file guards", () => {
  test("sniffs real image headers and ignores claimed mime names", () => {
    expect(sniffImageKind(PNG)).toBe("png");
    expect(sniffImageKind(JPEG)).toBe("jpeg");
    expect(imageUploadMeta(PNG)?.mime).toBe("image/png");
    expect(sniffImageKind(HTML)).toBeNull();
    expect(sniffImageKind(SVG)).toBeNull();
    expect(sniffImageKind(ZIP)).toBeNull();
    expect(imageUploadMeta(Buffer.from("not-an-image"))).toBeNull();
  });

  test("spreadsheets require matching extension and content", () => {
    expect(sniffSpreadsheetKind(ZIP, "catalog.xlsx")).toBe("xlsx");
    expect(sniffSpreadsheetKind(OLE, "catalog.xls")).toBe("xls");
    expect(sniffSpreadsheetKind(CSV, "catalog.csv")).toBe("csv");
    expect(sniffSpreadsheetKind(ZIP, "catalog.csv")).toBeNull();
    expect(sniffSpreadsheetKind(HTML, "catalog.csv")).toBeNull();
    expect(sniffSpreadsheetKind(CSV, "catalog.xlsx")).toBeNull();
    expect(sniffSpreadsheetKind(PNG, "photo.xlsx")).toBeNull();
    expect(sniffSpreadsheetKind(ZIP, "notes.txt")).toBeNull();
  });

  test("file names are stripped to a basename with a safe extension", () => {
    expect(safeUploadFileName("../../etc/passwd", ".jpg")).toBe("passwd.jpg");
    expect(safeUploadFileName("C:\\\\temp\\\\photo.png", ".png")).toBe("photo.png");
    expect(safeUploadFileName("catalog.xlsx.html", ".xlsx")).toBe("catalog.xlsx");
    expect(lastFileExtension("a/b/c.XLSX")).toBe(".xlsx");
    expect(safeUploadFileName("..", ".csv")).toBe("file.csv");
  });
});
