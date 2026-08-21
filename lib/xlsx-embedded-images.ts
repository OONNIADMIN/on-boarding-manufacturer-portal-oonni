import JSZip from "jszip";
import { imageUploadMeta } from "@/lib/upload-file-guard";

export type EmbeddedSheetImage = {
  rowIndex: number;
  colIndex: number;
  buffer: Buffer;
  mime: string;
  ext: string;
  filename: string;
};

export function columnLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    if (ch < "A" || ch > "Z") return -1;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function parseCellRef(ref: string): { colIndex: number; rowIndex: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
  if (!match) return null;
  const colIndex = columnLettersToIndex(match[1]);
  const rowIndex = Number(match[2]) - 1;
  if (colIndex < 0 || !Number.isFinite(rowIndex) || rowIndex < 0) return null;
  return { colIndex, rowIndex };
}

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseRelationshipTargets(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\b([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(relsXml))) {
    const attrs = match[1];
    const id = /(?:\bId|r:id)="([^"]+)"/i.exec(attrs)?.[1];
    const target = /Target="([^"]+)"/i.exec(attrs)?.[1];
    if (id && target) map.set(id, decodeXml(target).replace(/\\/g, "/"));
  }
  return map;
}

function mediaZipPath(target: string): string {
  const cleaned = target.replace(/^\.\//, "");
  if (cleaned.startsWith("xl/")) return cleaned;
  if (cleaned.startsWith("../media/")) return `xl/media/${cleaned.slice("../media/".length)}`;
  if (cleaned.startsWith("media/")) return `xl/${cleaned}`;
  return `xl/media/${cleaned.split("/").pop() ?? cleaned}`;
}

function firstWorksheetPath(workbookXml: string, workbookRels: string): string {
  const sheetMatch = /<sheet\b[^>]*\br:id="([^"]+)"/i.exec(workbookXml);
  const rid = sheetMatch?.[1];
  const rels = parseRelationshipTargets(workbookRels);
  const target = rid ? rels.get(rid) : undefined;
  if (!target) return "xl/worksheets/sheet1.xml";
  const cleaned = target.replace(/^\.\//, "");
  if (cleaned.startsWith("xl/")) return cleaned;
  if (cleaned.startsWith("worksheets/")) return `xl/${cleaned}`;
  return `xl/worksheets/${cleaned.split("/").pop() ?? "sheet1.xml"}`;
}

function parseValueMetadataIndexes(metadataXml: string): number[] {
  const start = metadataXml.indexOf("<valueMetadata");
  const slice = start >= 0 ? metadataXml.slice(start) : metadataXml;
  return [...slice.matchAll(/<rc\b[^>]*\bv="(\d+)"/gi)].map((m) => Number(m[1]));
}

function parseRichValueRelIds(richValueRelXml: string): string[] {
  return [...richValueRelXml.matchAll(/<(?:\w+:)?rel\b[^>]*\br:id="([^"]+)"/gi)].map((m) => m[1]);
}

function parseLocalImageIds(rdRichValueXml: string): number[] {
  const blocks = [...rdRichValueXml.matchAll(/<(?:\w+:)?rv\b[^>]*>[\s\S]*?<\/(?:\w+:)?rv>/gi)];
  return blocks.map((block) => {
    const first = /<(?:\w+:)?v>(\d+)<\/(?:\w+:)?v>/i.exec(block[0]);
    return first ? Number(first[1]) : -1;
  });
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) ?? zip.file(path.replace(/^\//, ""));
  if (!file) return null;
  return file.async("string");
}

async function readZipBuffer(zip: JSZip, path: string): Promise<Buffer | null> {
  const file = zip.file(path) ?? zip.file(path.replace(/^\//, ""));
  if (!file) return null;
  return Buffer.from(await file.async("uint8array"));
}

function pushImage(
  out: EmbeddedSheetImage[],
  seen: Set<string>,
  rowIndex: number,
  colIndex: number,
  buffer: Buffer,
  filename: string
): void {
  const meta = imageUploadMeta(buffer);
  if (!meta) return;
  const key = `${rowIndex}:${colIndex}:${filename}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    rowIndex,
    colIndex,
    buffer,
    mime: meta.mime,
    ext: meta.ext.replace(".", ""),
    filename: filename.split("/").pop() || `image${meta.ext}`,
  });
}

async function extractInCellRichImages(zip: JSZip, sheetXml: string, out: EmbeddedSheetImage[], seen: Set<string>) {
  const metadataXml = await readZipText(zip, "xl/metadata.xml");
  const relsXml = await readZipText(zip, "xl/richData/_rels/richValueRel.xml.rels");
  const richRelXml = await readZipText(zip, "xl/richData/richValueRel.xml");
  const rdXml = await readZipText(zip, "xl/richData/rdrichvalue.xml");
  if (!metadataXml || !relsXml || !richRelXml || !rdXml) return;

  const vmToRich = parseValueMetadataIndexes(metadataXml);
  const localIds = parseLocalImageIds(rdXml);
  const relIds = parseRichValueRelIds(richRelXml);
  const relTargets = parseRelationshipTargets(relsXml);

  const cellRe = /<c\b([^>]*?)\bvm="(\d+)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(sheetXml))) {
    const ref = /\br="([A-Z]+\d+)"/i.exec(match[1])?.[1];
    const parsed = ref ? parseCellRef(ref) : null;
    if (!parsed) continue;
    const vm = Number(match[2]);
    if (!Number.isFinite(vm) || vm < 1) continue;
    const richIndex = vmToRich[vm - 1] ?? vm - 1;
    const localId = localIds[richIndex] ?? richIndex;
    const relId = relIds[localId];
    if (!relId) continue;
    const target = relTargets.get(relId);
    if (!target) continue;
    const path = mediaZipPath(target);
    const buf = await readZipBuffer(zip, path);
    if (!buf?.length) continue;
    pushImage(out, seen, parsed.rowIndex, parsed.colIndex, buf, path);
  }
}

async function extractFloatingPictures(
  zip: JSZip,
  sheetPath: string,
  out: EmbeddedSheetImage[],
  seen: Set<string>
) {
  const sheetFile = sheetPath.split("/").pop() ?? "sheet1.xml";
  const sheetRels = await readZipText(zip, `xl/worksheets/_rels/${sheetFile}.rels`);
  if (!sheetRels) return;
  const drawingTarget = [...parseRelationshipTargets(sheetRels).values()].find((t) =>
    t.toLowerCase().includes("drawing")
  );
  if (!drawingTarget) return;

  const drawingFile = drawingTarget.split("/").pop() ?? "drawing1.xml";
  const drawingPath = `xl/drawings/${drawingFile}`;
  const drawingXml = await readZipText(zip, drawingPath);
  const drawingRels = await readZipText(zip, `xl/drawings/_rels/${drawingFile}.rels`);
  if (!drawingXml || !drawingRels) return;
  const relTargets = parseRelationshipTargets(drawingRels);

  const anchors = drawingXml.split(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b/i).slice(1);
  for (const anchor of anchors) {
    if (!/<xdr:pic\b/i.test(anchor)) continue;
    const col = Number(/<xdr:col>(\d+)<\/xdr:col>/i.exec(anchor)?.[1] ?? -1);
    const row = Number(/<xdr:row>(\d+)<\/xdr:row>/i.exec(anchor)?.[1] ?? -1);
    const embed = /r:embed="([^"]+)"/i.exec(anchor)?.[1];
    if (col < 0 || row < 0 || !embed) continue;
    const target = relTargets.get(embed);
    if (!target) continue;
    const path = mediaZipPath(target);
    const buf = await readZipBuffer(zip, path);
    if (!buf?.length) continue;
    pushImage(out, seen, row, col, buf, path);
  }
}

export async function extractEmbeddedImagesFromXlsx(buffer: Buffer): Promise<EmbeddedSheetImage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const workbookRels = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRels) return [];
  const sheetPath = firstWorksheetPath(workbookXml, workbookRels);
  const sheetXml = await readZipText(zip, sheetPath);
  if (!sheetXml) return [];

  const out: EmbeddedSheetImage[] = [];
  const seen = new Set<string>();
  await extractInCellRichImages(zip, sheetXml, out, seen);
  await extractFloatingPictures(zip, sheetPath, out, seen);
  out.sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
  return out;
}

/** Remote media library rejects files at 100MB. */
export const REMOTE_CATALOG_FILE_MAX_BYTES = 100 * 1024 * 1024;

export async function stripXlsxEmbeddedMedia(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith("xl/media/") && !zip.files[name]?.dir) {
      zip.remove(name);
    }
  }
  return Buffer.from(
    await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })
  );
}

export async function prepareCatalogFileForRemoteStore(
  buffer: Buffer,
  fileName: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  const lower = fileName.toLowerCase();
  const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const csvMime = "text/csv";

  if (buffer.length < REMOTE_CATALOG_FILE_MAX_BYTES) {
    return {
      buffer,
      fileName,
      mimeType: lower.endsWith(".csv") ? csvMime : xlsxMime,
    };
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const stripped = await stripXlsxEmbeddedMedia(buffer);
    if (stripped.length < REMOTE_CATALOG_FILE_MAX_BYTES) {
      return {
        buffer: stripped,
        fileName: fileName.replace(/\.xls$/i, ".xlsx"),
        mimeType: xlsxMime,
      };
    }
  }

  const { parseSpreadsheetRows } = await import("@/lib/catalog-spreadsheet-parse");
  const Papa = (await import("papaparse")).default;
  const rows = parseSpreadsheetRows(buffer, fileName);
  const csv = Buffer.from(Papa.unparse(rows), "utf8");
  if (csv.length >= REMOTE_CATALOG_FILE_MAX_BYTES) return null;
  return {
    buffer: csv,
    fileName: `${fileName.replace(/\.[^.]+$/, "")}.csv`,
    mimeType: csvMime,
  };
}
