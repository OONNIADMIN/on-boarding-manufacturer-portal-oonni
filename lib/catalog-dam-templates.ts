import type { ImageKitListedFile } from "@/lib/imagekit";
import {
  findImageKitTemplateForProductType,
  imageKitUploadFailureMessage,
  isImageKitUploadConfigured,
  listImageKitTemplates,
} from "@/lib/imagekit";

export type CatalogDamTemplateDefinition = {
  /** Product template key (e.g. "Tableware") — used in the select value and ImageKit lookup */
  id: string;
  /** Label in the UI (no date suffix) */
  name: string;
  slug: string;
  sourceUrl: string;
  filename: string;
};

/** Fallback when ImageKit is unavailable (local dev). */
const STATIC_FALLBACK_TEMPLATES: CatalogDamTemplateDefinition[] = [
  {
    id: "Furniture-Fixtures",
    name: "Furniture & Fixtures",
    slug: "furniture-fixtures",
    sourceUrl:
      "https://ik.imagekit.io/Oonni2026/Template-excel-oonni/OONNI_Catalog-Template-Furniture-Fixtures%2005-01-2026.xlsx",
    filename: "OONNI_Catalog-Template-Furniture-Fixtures 05-01-2026.xlsx",
  },
];

function extractDateFromTemplateFilename(name: string): string | null {
  const m = name.match(/(\d{2}-\d{2}-\d{4})/);
  return m?.[1] ?? null;
}

/**
 * Integration key from ImageKit file name — segment after OONNI_Catalog-Template-, without date.
 * Example: …Template-Tableware 05-01-2026.xlsx → "Tableware"
 */
export function productTemplateKeyFromFilename(filename: string): string {
  let base = filename.replace(/\.[^.]+$/i, "").trim();
  base = base.replace(/^OONNI[_-]?Catalog[_-]?Template[_-]?/i, "");
  base = base.replace(/[\s_]+\d{2}-\d{2}-\d{4}$/, "").trim();
  base = base.replace(/_/g, " ");
  return base.trim();
}

/** UI label from template key (hyphens → " & ", title case). No date. */
export function displayLabelFromTemplateKey(templateKey: string): string {
  const key = templateKey.trim();
  if (!key) return key;

  if (key.includes("-")) {
    return key
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" & ");
  }

  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
}

function slugFromTemplateKey(templateKey: string): string {
  return templateKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickNewerTemplateFile(a: ImageKitListedFile, b: ImageKitListedFile): ImageKitListedFile {
  const dateA = extractDateFromTemplateFilename(a.name);
  const dateB = extractDateFromTemplateFilename(b.name);
  if (dateA && dateB && dateA !== dateB) {
    return dateB.localeCompare(dateA) > 0 ? b : a;
  }
  return b.name.localeCompare(a.name) > 0 ? b : a;
}

function dedupeTemplatesByProductKey(files: ImageKitListedFile[]): ImageKitListedFile[] {
  const byKey = new Map<string, ImageKitListedFile>();
  for (const file of files) {
    const key = productTemplateKeyFromFilename(file.name);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? pickNewerTemplateFile(existing, file) : file);
  }
  return [...byKey.values()];
}

export function imageKitFileToCatalogTemplate(file: ImageKitListedFile): CatalogDamTemplateDefinition {
  const filename = file.name.trim();
  const templateKey = productTemplateKeyFromFilename(filename);

  return {
    id: templateKey,
    name: displayLabelFromTemplateKey(templateKey),
    slug: slugFromTemplateKey(templateKey),
    sourceUrl: file.url,
    filename,
  };
}

export async function listCatalogDamTemplatesFromImageKit(): Promise<CatalogDamTemplateDefinition[]> {
  if (!isImageKitUploadConfigured()) {
    return [...STATIC_FALLBACK_TEMPLATES];
  }

  const files = dedupeTemplatesByProductKey(await listImageKitTemplates({ limit: 1000 }));

  return files
    .map(imageKitFileToCatalogTemplate)
    .filter((t) => t.id && t.sourceUrl)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function getCatalogDamTemplateById(
  templateKey: string
): Promise<CatalogDamTemplateDefinition | undefined> {
  const key = templateKey.trim();
  if (!key) return undefined;

  const list = await listCatalogDamTemplatesFromImageKit();
  const fromList = list.find((t) => t.id === key);
  if (fromList) return fromList;

  if (!isImageKitUploadConfigured()) return undefined;

  const file = await findImageKitTemplateForProductType({ name: key, slug: key });
  if (!file?.url) return undefined;

  return imageKitFileToCatalogTemplate(file);
}

export async function resolveCatalogTemplateDownload(
  templateKey: string
): Promise<{ url: string; filename: string } | null> {
  const key = templateKey.trim();
  if (!key) return null;

  const list = await listCatalogDamTemplatesFromImageKit();
  const fromList = list.find((t) => t.id === key);
  if (fromList?.sourceUrl) {
    return { url: fromList.sourceUrl, filename: fromList.filename };
  }

  if (isImageKitUploadConfigured()) {
    const files = await listImageKitTemplates({ limit: 1000 });
    const byKey = files.find((file) => productTemplateKeyFromFilename(file.name) === key);
    if (byKey?.url) {
      return { url: byKey.url, filename: byKey.name.trim() };
    }

    const file = await findImageKitTemplateForProductType({
      name: key,
      slug: slugFromTemplateKey(key),
    });
    if (file?.url) {
      return { url: file.url, filename: file.name.trim() };
    }
  }

  return null;
}

export function catalogDamTemplateListErrorMessage(error: unknown): string | null {
  return imageKitUploadFailureMessage(error);
}
