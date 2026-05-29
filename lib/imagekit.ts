import ImageKit, { APIConnectionError, AuthenticationError, toFile } from "@imagekit/nodejs";

let imagekitClient: ImageKit | null = null;

function requireImageKitPrivateKey(): string {
  const key = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      "IMAGEKIT_PRIVATE_KEY is missing. Add it to the server environment: local dev uses .env.local; Docker Compose only loads .env unless you run: docker compose --env-file .env.local up. Copy the private API key from ImageKit Dashboard → Developer options → API keys."
    );
  }
  return key;
}

function getImageKit(): ImageKit {
  if (!imagekitClient) {
    imagekitClient = new ImageKit({ privateKey: requireImageKitPrivateKey() });
  }
  return imagekitClient;
}

/** True when the private key is set (upload may still fail if the key is wrong). */
export function isImageKitUploadConfigured(): boolean {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY?.trim());
}

/** User-facing hint when upload/delete to ImageKit fails. */
export function imageKitUploadFailureMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    if (error.message.includes("IMAGEKIT_PRIVATE_KEY")) {
      return error.message;
    }
  }
  if (error instanceof AuthenticationError) {
    return "ImageKit rejected the upload (401). Confirm IMAGEKIT_PRIVATE_KEY is the account private API key, not the public key, and has no extra spaces or quotes.";
  }
  if (error instanceof APIConnectionError) {
    return "Could not reach ImageKit (network). Check outbound HTTPS from the server and try again.";
  }
  return undefined;
}

export interface ImageKitUploadResult {
  fileId: string;
  name: string;
  url: string;
  filePath: string;
  size: number;
  width?: number;
  height?: number;
  mimeType?: string;
}

function imageKitDeliveryBase(): string {
  const raw =
    (process.env.IMAGEKIT_URL_ENDPOINT || process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "").trim();
  return raw.replace(/\/+$/, "");
}

function shouldStripUpdatedAtForHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.endsWith(".imagekit.io")) return true;
  const base = imageKitDeliveryBase();
  if (!base) return false;
  try {
    return new URL(base).hostname.toLowerCase() === h;
  } catch {
    return false;
  }
}

function shouldAutoOptimizeDelivery(): boolean {
  const raw = (process.env.IMAGEKIT_AUTO_OPTIMIZE_DELIVERY ?? "true").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function hasTransformationInPath(pathname: string): boolean {
  return pathname.includes("/tr:");
}

/** Ensure web delivery optimization using ImageKit URL transforms (`q-auto,f-auto`). */
function withAutoWebOptimization(url: string): string {
  if (!url || !shouldAutoOptimizeDelivery()) return url;
  try {
    const u = new URL(url);
    if (!shouldStripUpdatedAtForHost(u.hostname)) return url;
    if (hasTransformationInPath(u.pathname)) return url;
    const p = u.pathname.startsWith("/") ? u.pathname : `/${u.pathname}`;
    u.pathname = `/tr:q-auto,f-auto${p}`;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * ImageKit upload responses append ?updatedAt=… for cache busting. The same file is served
 * without it; keeping that query in spreadsheets/Excel can break cells or link handling.
 * Strip it for stable delivery URLs stored in DB and catalog files.
 * Also applies when delivery uses a custom CNAME set in IMAGEKIT_URL_ENDPOINT.
 */
export function canonicalImageKitUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!shouldStripUpdatedAtForHost(u.hostname)) return url;
    u.searchParams.delete("updatedAt");
    const rest = u.searchParams.toString();
    u.search = rest ? `?${rest}` : "";
    return u.toString();
  } catch {
    return url;
  }
}

function isAbsoluteHttpUrl(s: string): boolean {
  if (!s) return false;
  if (s.startsWith("//")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function joinDeliveryBaseAndFilePath(base: string, filePath: string): string {
  const rel = filePath.replace(/^\/+/, "");
  const encoded = rel
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return encoded ? `${base}/${encoded}` : base;
}

/**
 * Stable browser URL for ImageKit: use stored s3_url when valid, otherwise
 * IMAGEKIT_URL_ENDPOINT + s3_key (legacy rows, wrong env at upload time, etc.).
 */
export function resolveImageKitDeliveryUrl(
  s3_url: string | null | undefined,
  s3_key: string | null | undefined
): string {
  const trimmed = (s3_url ?? "").trim();
  if (trimmed.startsWith("//")) {
    return withAutoWebOptimization(canonicalImageKitUrl(`https:${trimmed}`));
  }
  if (isAbsoluteHttpUrl(trimmed)) {
    return withAutoWebOptimization(canonicalImageKitUrl(trimmed));
  }
  const base = imageKitDeliveryBase();
  const key = (s3_key ?? "").trim();
  if (base && key) {
    return withAutoWebOptimization(canonicalImageKitUrl(joinDeliveryBaseAndFilePath(base, key)));
  }
  return withAutoWebOptimization(canonicalImageKitUrl(trimmed));
}

/** Normalize s3_url on image rows returned to clients (fixes legacy ?updatedAt= in DB). */
export function withCanonicalImageUrl<T extends { s3_url: string; s3_key?: string }>(row: T): T {
  return { ...row, s3_url: resolveImageKitDeliveryUrl(row.s3_url, row.s3_key ?? "") };
}

export async function uploadToImageKit(
  fileBuffer: Buffer,
  fileName: string,
  folder: string,
  mimeType?: string,
  options?: { preTransform?: string }
): Promise<ImageKitUploadResult> {
  const imagekit = getImageKit();
  const file = await toFile(fileBuffer, fileName, { type: mimeType ?? "application/octet-stream" });
  const mime = (mimeType ?? "").toLowerCase();
  const supportsTransform = mime.startsWith("image/") || mime.startsWith("video/");
  const preTransform = options?.preTransform?.trim() || "q-80";

  const result = await imagekit.files.upload({
    file,
    fileName,
    folder,
    useUniqueFileName: true,
    ...(supportsTransform
      ? {
          transformation: {
            // Base compression at ingest for media files.
            pre: preTransform,
          },
        }
      : {}),
  });

  const rawUrl = result.url ?? "";
  return {
    fileId: result.fileId ?? "",
    name: result.name ?? fileName,
    url: canonicalImageKitUrl(rawUrl),
    filePath: result.filePath ?? "",
    size: result.size ?? 0,
    width: result.width ?? undefined,
    height: result.height ?? undefined,
    mimeType: (result as { mime?: string }).mime ?? undefined,
  };
}

export async function deleteFromImageKit(fileId: string): Promise<void> {
  const imagekit = getImageKit();
  await imagekit.files.delete(fileId);
}

/** Normalized row from ImageKit GET /v1/files (list assets). */
export interface ImageKitListedFile {
  fileId: string;
  name: string;
  filePath: string;
  url: string;
  thumbnail?: string;
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
  fileType?: string;
}

/**
 * List files in a Media Library folder via ImageKit Admin API (GET /v1/files).
 * @see https://docs.imagekit.io/api-reference/media-api/list-and-search-files
 */
function normalizeFolderPathForListApi(path: string): string {
  let p = path.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+$/, "");
  return `${p}/`;
}

function parseImageKitAssetsListBody(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    if (Array.isArray(o.files)) return o.files as Record<string, unknown>[];
  }
  return [];
}

/** Tag used when templates are tagged in ImageKit (optional — folder listing is primary). */
export const IMAGEKIT_TEMPLATE_TAG = "template";

/** ImageKit Media Library folder where catalog Excel templates are stored. */
export function imageKitTemplatesFolder(): string {
  const raw = (process.env.IMAGEKIT_TEMPLATES_FOLDER || "/Template-excel-oonni").trim();
  return raw || "/Template-excel-oonni";
}

function isSpreadsheetTemplateFile(file: ImageKitListedFile): boolean {
  const name = file.name.toLowerCase();
  const mime = (file.mime ?? file.fileType ?? "").toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  );
}

function slugToTitleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

/** Build lowercase tokens used to match Nautical product types to ImageKit file names. */
export function buildImageKitTemplateMatchTokens(params: {
  name?: string | null;
  slug?: string | null;
}): string[] {
  const name = (params.name ?? "").trim();
  const slug = (params.slug ?? "").trim().toLowerCase();
  const tokens = new Set<string>();

  if (name) tokens.add(normalizeTemplateName(name));
  if (slug) {
    tokens.add(slug);
    tokens.add(slug.replace(/-/g, ""));
    tokens.add(`catalog-template-${slug}`);
    tokens.add(`catalog-template-${slugToTitleCase(slug)}`.toLowerCase());
    tokens.add(slugToTitleCase(slug).toLowerCase());
  }

  if (name) {
    const simplified = name
      .toLowerCase()
      .replace(/&/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    for (const word of simplified.split(/\s+/).filter((w) => w.length > 2)) {
      tokens.add(word);
    }
  }

  return [...tokens].filter(Boolean);
}

function pickPreferredTemplateFile(candidates: ImageKitListedFile[]): ImageKitListedFile {
  if (candidates.length === 1) return candidates[0];
  return [...candidates].sort((a, b) => {
    const dateA = extractDateFromTemplateName(a.name);
    const dateB = extractDateFromTemplateName(b.name);
    if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
    return b.name.localeCompare(a.name);
  })[0];
}

/** Prefer filenames like `05-20-2026` when multiple template versions exist. */
function extractDateFromTemplateName(name: string): string | null {
  const m = name.match(/(\d{2}-\d{2}-\d{4})/);
  return m?.[1] ?? null;
}

function mapImageKitAssetRow(item: Record<string, unknown>): ImageKitListedFile {
  return {
    fileId: String(item.fileId ?? ""),
    name: String(item.name ?? ""),
    filePath: String(item.filePath ?? ""),
    url: canonicalImageKitUrl(String(item.url ?? "")),
    thumbnail:
      item.thumbnail != null && String(item.thumbnail)
        ? canonicalImageKitUrl(String(item.thumbnail))
        : undefined,
    size: typeof item.size === "number" ? item.size : undefined,
    width: typeof item.width === "number" ? item.width : undefined,
    height: typeof item.height === "number" ? item.height : undefined,
    mime: item.mime != null ? String(item.mime) : undefined,
    fileType: item.fileType != null ? String(item.fileType) : undefined,
  };
}

function filterImageKitFileRows(rows: Record<string, unknown>[]): ImageKitListedFile[] {
  return rows
    .filter((item) => String(item.type ?? "file") === "file" || item.fileId != null)
    .map(mapImageKitAssetRow);
}

export async function listImageKitFilesInFolder(params: {
  folderPath: string;
  limit?: number;
  skip?: number;
  /** API query `fileType`: restrict to images, non-images, or all. */
  fileTypeFilter?: "image" | "non-image" | "all";
}): Promise<ImageKitListedFile[]> {
  const imagekit = getImageKit();
  const limit = Math.min(Math.max(params.limit ?? 1000, 1), 1000);
  const skip = Math.max(params.skip ?? 0, 0);
  const path = normalizeFolderPathForListApi(params.folderPath);
  const fileType = params.fileTypeFilter ?? "image";

  const query: Record<string, string> = {
    path,
    type: "file",
    limit: String(limit),
    skip: String(skip),
    fileType,
  };

  const raw = await imagekit.assets.list(query);
  const rows = parseImageKitAssetsListBody(raw);
  return filterImageKitFileRows(rows);
}

/** Escape a value for ImageKit Lucene-style searchQuery strings (inside double quotes). */
export function escapeImageKitSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build ImageKit `name` filter — exact match; values with spaces must use `name="..."`. */
function imageKitNameEqualsClause(name: string): string {
  return `name="${escapeImageKitSearchValue(name.trim())}"`;
}

export interface ImageKitSearchFilesParams {
  /** Pre-built Lucene query (takes precedence over tags/name/customMetadata). */
  searchQuery?: string;
  tags?: string[];
  /** File name filter — combined with tags when searchQuery is omitted. */
  name?: string;
  customMetadata?: Record<string, string>;
  folderPath?: string;
  limit?: number;
  skip?: number;
  fileTypeFilter?: "image" | "non-image" | "all";
}

/**
 * Search ImageKit Media Library assets (GET /v1/files).
 * @see https://docs.imagekit.io/api-reference/media-api/list-and-search-files
 */
export async function searchImageKitFiles(
  params: ImageKitSearchFilesParams
): Promise<ImageKitListedFile[]> {
  const imagekit = getImageKit();
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
  const skip = Math.max(params.skip ?? 0, 0);
  const fileType = params.fileTypeFilter ?? "all";

  let searchQuery = params.searchQuery?.trim();

  if (!searchQuery) {
    const parts: string[] = [];
    if (params.tags?.length) {
      const tagList = params.tags.map((t) => `"${escapeImageKitSearchValue(t)}"`).join(", ");
      parts.push(`"tags" IN [${tagList}]`);
    }
    if (params.name?.trim()) {
      parts.push(imageKitNameEqualsClause(params.name));
    }
    if (params.customMetadata) {
      for (const [k, v] of Object.entries(params.customMetadata)) {
        parts.push(`"customMetadata.${k}"="${escapeImageKitSearchValue(v)}"`);
      }
    }
    if (parts.length) {
      searchQuery = parts.join(" AND ");
    }
  }

  const query: Record<string, string> = {
    type: "file",
    limit: String(limit),
    skip: String(skip),
    fileType,
  };

  if (searchQuery) {
    query.searchQuery = searchQuery;
  }
  if (params.folderPath?.trim()) {
    query.path = normalizeFolderPathForListApi(params.folderPath);
  }

  const raw = await imagekit.assets.list(query);
  const rows = parseImageKitAssetsListBody(raw);
  return filterImageKitFileRows(rows);
}

/**
 * List catalog Excel templates from ImageKit (GET /v1/files).
 * Primary: folder IMAGEKIT_TEMPLATES_FOLDER (default /Template-excel-oonni).
 * Fallback: tag "template" when files are tagged in other environments.
 * @see https://imagekit.io/docs/api-reference/media-api/list-and-search-files
 */
export async function listImageKitTemplates(params?: {
  limit?: number;
  skip?: number;
}): Promise<ImageKitListedFile[]> {
  const limit = params?.limit ?? 1000;
  const skip = params?.skip ?? 0;
  const folder = imageKitTemplatesFolder();

  const byFolder = await searchImageKitFiles({
    folderPath: folder,
    limit,
    skip,
    fileTypeFilter: "all",
  });
  const spreadsheets = byFolder.filter(isSpreadsheetTemplateFile);
  if (spreadsheets.length) return spreadsheets;

  const byTag = await searchImageKitFiles({
    tags: [IMAGEKIT_TEMPLATE_TAG],
    limit,
    skip,
    fileTypeFilter: "all",
  });
  return byTag.filter(isSpreadsheetTemplateFile);
}

/** Resolve the ImageKit search key from a Nautical product type (name takes precedence). */
export function nauticalTemplateSearchName(params: {
  name?: string | null;
  slug?: string | null;
}): string {
  return (params.name ?? "").trim() || (params.slug ?? "").trim();
}

/** Normalize template names for comparison (Nautical name ↔ ImageKit file name). */
function normalizeTemplateName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/u, "")
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " & ");
}

/** Match an ImageKit template file to a Nautical product type (name + slug). */
export function matchImageKitTemplateToProductType(
  pt: { name?: string | null; slug?: string | null },
  templates: ImageKitListedFile[]
): ImageKitListedFile | null {
  const tokens = buildImageKitTemplateMatchTokens(pt);
  if (!tokens.length) return null;

  const haystack = (file: ImageKitListedFile) =>
    `${file.name} ${file.filePath}`.toLowerCase().replace(/_/g, " ");

  const exactName = (pt.name ?? "").trim();
  if (exactName) {
    const exact = templates.filter(
      (t) => normalizeTemplateName(t.name) === normalizeTemplateName(exactName)
    );
    if (exact.length) return pickPreferredTemplateFile(exact);
  }

  const slug = (pt.slug ?? "").trim().toLowerCase();
  if (slug) {
    const slugMatches = templates.filter((t) => {
      const hay = haystack(t);
      return (
        hay.includes(`catalog-template-${slug}`) ||
        hay.includes(`catalog-template-${slugToTitleCase(slug).toLowerCase()}`) ||
        hay.includes(slugToTitleCase(slug).toLowerCase())
      );
    });
    if (slugMatches.length) return pickPreferredTemplateFile(slugMatches);
  }

  const tokenMatches = templates.filter((t) => {
    const hay = haystack(t);
    return tokens.some((token) => token.length >= 4 && hay.includes(token));
  });
  if (tokenMatches.length) return pickPreferredTemplateFile(tokenMatches);

  return null;
}

/** @deprecated use matchImageKitTemplateToProductType */
export function matchImageKitTemplateByNauticalName(
  nauticalName: string,
  templates: ImageKitListedFile[]
): ImageKitListedFile | null {
  return matchImageKitTemplateToProductType({ name: nauticalName }, templates);
}

/**
 * Search templates by Nautical product type name (tag: template).
 * Lists tagged files once and matches in memory by exact name.
 */
export async function searchImageKitTemplatesByName(
  name: string,
  options?: { limit?: number; skip?: number }
): Promise<ImageKitListedFile[]> {
  const q = normalizeTemplateName(name);
  if (!q) return [];

  const all = await listImageKitTemplates({
    limit: 1000,
    skip: options?.skip,
  });

  const matches = all.filter(
    (t) =>
      normalizeTemplateName(t.name) === q ||
      normalizeTemplateName(t.filePath.split("/").pop() ?? t.name) === q
  );

  const limit = options?.limit ?? 20;
  return matches.slice(0, limit);
}

/** Find ImageKit template for a Nautical product type. */
export async function findImageKitTemplateForProductType(params: {
  name?: string | null;
  slug?: string | null;
}): Promise<ImageKitListedFile | null> {
  const ikTemplates = await listImageKitTemplates({ limit: 1000 });
  return matchImageKitTemplateToProductType(params, ikTemplates);
}

export type NauticalProductTypeTemplateRef = {
  id: string;
  slug: string;
  name: string;
};

export type NauticalProductTypeWithTemplate = NauticalProductTypeTemplateRef & {
  template_search_name: string;
  template: ImageKitListedFile | null;
};

/**
 * Resolve ImageKit templates for Nautical product types.
 * Names always come from Nautical; ImageKit is only the file store.
 */
export async function resolveImageKitTemplatesForNauticalProductTypes(
  productTypes: NauticalProductTypeTemplateRef[]
): Promise<NauticalProductTypeWithTemplate[]> {
  const ikTemplates = await listImageKitTemplates({ limit: 1000 });

  return productTypes.map((pt) => {
    const templateSearchName = nauticalTemplateSearchName(pt);
    const template = matchImageKitTemplateToProductType(pt, ikTemplates);
    return {
      ...pt,
      template_search_name: templateSearchName,
      template,
    };
  });
}

/** Download file bytes from an ImageKit delivery URL (server-side). */
export async function downloadImageKitFileBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to download ImageKit file (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
