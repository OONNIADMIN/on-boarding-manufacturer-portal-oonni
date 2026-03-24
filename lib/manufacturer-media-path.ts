import type { Manufacturer } from "@prisma/client";

/**
 * ImageKit Media Library folder paths (e.g. `/test-harwin/images`).
 * Uses the manufacturer `slug` from the DB (unique) — not `id_slug`, so names match the dashboard.
 * Override with `imagekit_media_root` if you still store files under a legacy path (e.g. `/6_oldslug`).
 */
function sanitizePathSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "").replace(/^-+|-+$/g, "").slice(0, 100) || "mfr";
}

export function defaultManufacturerMediaRoot(m: Pick<Manufacturer, "id" | "slug">): string {
  const slugPart = sanitizePathSegment(m.slug || `m${m.id}`);
  return `/${slugPart}`;
}

/** Root path in ImageKit (no trailing slash). Subfolders: `images`, `catalogs`. */
export function manufacturerImageKitRoot(m: Manufacturer): string {
  const custom = m.imagekit_media_root?.trim();
  if (custom) {
    const normalized = custom.startsWith("/") ? custom : `/${custom}`;
    return normalized.replace(/\/+$/, "") || defaultManufacturerMediaRoot(m);
  }
  return defaultManufacturerMediaRoot(m);
}

export function manufacturerImageKitImagesFolder(m: Manufacturer): string {
  return `${manufacturerImageKitRoot(m)}/images`;
}

export function manufacturerImageKitCatalogsFolder(m: Manufacturer): string {
  return `${manufacturerImageKitRoot(m)}/catalogs`;
}
