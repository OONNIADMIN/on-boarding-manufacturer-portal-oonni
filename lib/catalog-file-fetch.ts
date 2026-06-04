import {
  canonicalImageKitUrl,
  isImageKitUploadConfigured,
  resolveImageKitDeliveryUrl,
  searchImageKitFiles,
} from "@/lib/imagekit";

function imageKitFilePathFromDeliveryUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    return `/${segments.slice(1).join("/")}`;
  } catch {
    return null;
  }
}

function catalogFileLabel(catalogFileUrl: string): string {
  const pathname = catalogFileUrl.split("?")[0] ?? "catalog.csv";
  const segment = pathname.split("/").pop() ?? "catalog.csv";
  return segment.includes(".") ? segment : `${segment}.csv`;
}

async function tryFetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function resolveDeliveryUrls(catalogFileUrl: string): Promise<string[]> {
  const urls = new Set<string>();
  const canonical = canonicalImageKitUrl(catalogFileUrl.trim());
  if (canonical) urls.add(canonical);

  const filePath = imageKitFilePathFromDeliveryUrl(catalogFileUrl);
  if (filePath) {
    urls.add(resolveImageKitDeliveryUrl("", filePath));
  }

  if (isImageKitUploadConfigured() && filePath) {
    try {
      const folderPath = filePath.slice(0, filePath.lastIndexOf("/")) || "/";
      const fileName = filePath.split("/").pop() ?? "";
      const listed = await searchImageKitFiles({
        folderPath,
        searchQuery: fileName,
        limit: 20,
        fileTypeFilter: "all",
      });
      const match =
        listed.find((f) => canonicalImageKitUrl(f.url) === canonical) ??
        listed.find((f) => f.filePath === filePath || f.name === fileName);
      if (match?.url) urls.add(canonicalImageKitUrl(match.url));
    } catch {
      /* list fallback is best-effort */
    }
  }

  return [...urls];
}

/** Download catalog spreadsheet bytes from ImageKit (tries alternate delivery URLs). */
export async function fetchCatalogSpreadsheetBuffer(catalogFileUrl: string): Promise<Buffer> {
  const candidates = await resolveDeliveryUrls(catalogFileUrl);
  const failures: string[] = [];

  for (const url of candidates) {
    const buffer = await tryFetchBuffer(url);
    if (buffer?.length) return buffer;
    failures.push(url);
  }

  throw new Error(
    "Could not download the catalog file from ImageKit. The file was uploaded, but the server could not reach the ImageKit CDN (ik.imagekit.io). " +
      "Check your network/DNS or retry the upload — product creation will use the file in memory when possible."
  );
}

export function catalogSpreadsheetFileName(catalogFileUrl: string): string {
  return catalogFileLabel(catalogFileUrl);
}
