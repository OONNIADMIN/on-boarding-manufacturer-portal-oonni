import { describe, expect, test } from "vitest";
import JSZip from "jszip";
import { fillMissingSkuHeader, looksLikeSkuValue } from "@/lib/catalog-spreadsheet-parse";
import {
  columnLettersToIndex,
  extractEmbeddedImagesFromXlsx,
  parseCellRef,
  stripXlsxEmbeddedMedia,
} from "@/lib/xlsx-embedded-images";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("embedded excel images", () => {
  test("parses cell references", () => {
    expect(columnLettersToIndex("D")).toBe(3);
    expect(parseCellRef("D14")).toEqual({ colIndex: 3, rowIndex: 13 });
    expect(parseCellRef("AA2")).toEqual({ colIndex: 26, rowIndex: 1 });
  });

  test("names an unlabeled SKU column", () => {
    const rows = [
      ["", "Product Description", "Image"],
      ["020-3-B", "Soup Spoon", ""],
      ["020-3-ES", "Soup Spoon 2", ""],
      ["D1005RR", "Bowl", ""],
    ];
    expect(looksLikeSkuValue("020-3-B")).toBe(true);
    expect(fillMissingSkuHeader(rows, 0)).toBe("sku");
    expect(rows[0][0]).toBe("sku");
  });

  test("extracts in-cell pictures from Excel rich data", async () => {
    const zip = new JSZip();
    zip.file(
      "xl/workbook.xml",
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    );
    zip.file(
      "xl/worksheets/sheet1.xml",
      `<worksheet><sheetData><row r="1"><c r="A1"><v>sku</v></c><c r="B1"><v>Image</v></c></row><row r="2"><c r="A2"><v>SKU-1</v></c><c r="B2" vm="1"><v>#VALUE!</v></c></row></sheetData></worksheet>`
    );
    zip.file(
      "xl/metadata.xml",
      `<metadata xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><futureMetadata name="XLRICHVALUE" count="1"><bk><extLst><ext><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata><valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>`
    );
    zip.file(
      "xl/richData/rdrichvalue.xml",
      `<rvData count="1"><rv s="0"><v>0</v><v>5</v></rv></rvData>`
    );
    zip.file(
      "xl/richData/richValueRel.xml",
      `<richValueRels xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rel r:id="rId1"/></richValueRels>`
    );
    zip.file(
      "xl/richData/_rels/richValueRel.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`
    );
    zip.file("xl/media/image1.png", PNG);
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    const images = await extractEmbeddedImagesFromXlsx(buffer);
    expect(images).toHaveLength(1);
    expect(images[0]?.rowIndex).toBe(1);
    expect(images[0]?.colIndex).toBe(1);
    expect(images[0]?.mime).toBe("image/png");
  });

  test("strips embedded media so a large workbook can be stored", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", "<workbook/>");
    zip.file("xl/media/image1.png", PNG);
    zip.file("xl/media/image2.png", PNG);
    const original = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    const stripped = await stripXlsxEmbeddedMedia(original);
    const out = await JSZip.loadAsync(stripped);
    expect(Object.keys(out.files).some((name) => name.startsWith("xl/media/image"))).toBe(false);
    expect(stripped.length).toBeLessThan(original.length);
  });
});
