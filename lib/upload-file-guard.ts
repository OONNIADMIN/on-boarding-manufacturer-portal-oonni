export type ImageKind = "jpeg" | "png" | "webp" | "gif";
export type SpreadsheetKind = "csv" | "xlsx" | "xls";

const IMAGE_MIME: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_EXT: Record<ImageKind, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
};

export function lastFileExtension(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function safeUploadFileName(original: string, extWithDot: string): string {
  const base = original.replace(/\\/g, "/").split("/").pop() ?? "file";
  let stem = base;
  while (/\.(html?|php\d*|phtml|exe|js|mjs|svg|xml|sh|bat|cmd)$/i.test(stem)) {
    stem = stem.replace(/\.[^.]+$/, "");
  }
  stem = stem.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  stem = (stem || "file").slice(0, 80);
  const ext = extWithDot.startsWith(".") ? extWithDot.toLowerCase() : `.${extWithDot.toLowerCase()}`;
  return `${stem}${ext}`;
}

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

export function sniffImageKind(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return "gif";
  }
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function imageUploadMeta(buf: Buffer): { kind: ImageKind; mime: string; ext: string } | null {
  const kind = sniffImageKind(buf);
  if (!kind) return null;
  return { kind, mime: IMAGE_MIME[kind], ext: IMAGE_EXT[kind] };
}

function looksLikeHtmlOrScript(buf: Buffer): boolean {
  const head = buf.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<svg") ||
    head.startsWith("<script") ||
    head.startsWith("<?php") ||
    head.startsWith("<%")
  );
}

function hasNul(buf: Buffer): boolean {
  return buf.includes(0);
}

export function sniffSpreadsheetKind(buf: Buffer, fileName: string): SpreadsheetKind | null {
  if (buf.length < 8) return null;
  const ext = lastFileExtension(fileName);
  const zip = startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06]);
  const ole = startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  if (ext === ".xlsx" && zip) return "xlsx";
  if (ext === ".xls" && ole) return "xls";
  if (ext === ".csv" && !zip && !ole && !hasNul(buf) && !looksLikeHtmlOrScript(buf)) return "csv";
  return null;
}

export function spreadsheetExt(kind: SpreadsheetKind): string {
  return `.${kind}`;
}
