import type { Manufacturer } from "@prisma/client";

/**
 * ImageKit Media Library folder paths (e.g. `/Elite/images`).
 * Uses the manufacturer company `name` so the folder matches what you see in the dashboard.
 * Override with `imagekit_media_root` if files already live under a legacy path (e.g. `/toughbuilt`).
 */
function sanitizePathSegment(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function defaultManufacturerMediaRoot(
  m: Pick<Manufacturer, "id" | "slug"> & { name?: string | null }
): string {
  const fromName = sanitizePathSegment(m.name || "");
  const fromSlug = sanitizePathSegment(m.slug || "");
  return `/${fromName || fromSlug || `m${m.id}`}`;
}

export type ManufacturerMediaPathInput = Pick<Manufacturer, "id" | "slug"> & {
  name?: string | null;
  imagekit_media_root?: string | null;
};

/** Root path in ImageKit (no trailing slash). Subfolders: `images`, `catalogs`. */
export function manufacturerImageKitRoot(m: ManufacturerMediaPathInput): string {
  const custom = m.imagekit_media_root?.trim();
  if (custom) {
    const normalized = custom.startsWith("/") ? custom : `/${custom}`;
    return normalized.replace(/\/+$/, "") || defaultManufacturerMediaRoot(m);
  }
  return defaultManufacturerMediaRoot(m);
}

export function manufacturerImageKitImagesFolder(m: ManufacturerMediaPathInput): string {
  return `${manufacturerImageKitRoot(m)}/images`;
}

export function manufacturerImageKitCatalogsFolder(m: ManufacturerMediaPathInput): string {
  return `${manufacturerImageKitRoot(m)}/catalogs`;
}

/** Per-catalog photo folder so a new directory appears in the media library. */
export function manufacturerImageKitCatalogImagesFolder(
  m: ManufacturerMediaPathInput,
  catalogSlug: string
): string {
  const slug = sanitizePathSegment(catalogSlug) || "catalog";
  return `${manufacturerImageKitImagesFolder(m)}/${slug}`;
}
