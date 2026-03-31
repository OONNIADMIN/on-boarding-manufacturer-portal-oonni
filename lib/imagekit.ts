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

  return rows
    .filter((item) => String(item.type ?? "file") === "file" || item.fileId != null)
    .map((item) => ({
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
    }));
}
