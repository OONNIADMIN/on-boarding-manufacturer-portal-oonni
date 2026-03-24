import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, requireAuth } from "@/lib/auth";
import { err, forbidden, notFound, ok, unauthorized } from "@/lib/api-response";
import {
  manufacturerImageKitCatalogsFolder,
  manufacturerImageKitImagesFolder,
} from "@/lib/manufacturer-media-path";
import { imageKitUploadFailureMessage, listImageKitFilesInFolder } from "@/lib/imagekit";

/**
 * Lists files in the manufacturer’s ImageKit folder (GET /v1/files with path + type=file).
 * Manufacturers see only their own folder; admins must pass manufacturer_id.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { searchParams } = new URL(req.url);
  const scopeRaw = searchParams.get("scope") ?? "images";
  if (scopeRaw !== "images" && scopeRaw !== "catalogs") {
    return err('scope must be "images" or "catalogs"');
  }
  const scope = scopeRaw;

  const limit = parseInt(searchParams.get("limit") ?? "100", 10);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);

  const isAdmin = user.role.name.trim().toLowerCase() === "admin";
  let manufacturerId: number;
  if (isAdmin) {
    const idRaw = searchParams.get("manufacturer_id");
    if (!idRaw) return err("manufacturer_id is required for admin users");
    manufacturerId = parseInt(idRaw, 10);
    if (!Number.isFinite(manufacturerId) || manufacturerId < 1) {
      return err("Invalid manufacturer_id");
    }
  } else {
    const mfr = effectiveManufacturerId(user);
    if (mfr == null) return forbidden("No manufacturer is assigned to your account");
    manufacturerId = mfr;
  }

  const manufacturer = await prisma.manufacturer.findFirst({
    where: { id: manufacturerId, deleted_at: null },
  });
  if (!manufacturer) return notFound("Manufacturer not found");

  const folderPath =
    scope === "catalogs"
      ? manufacturerImageKitCatalogsFolder(manufacturer)
      : manufacturerImageKitImagesFolder(manufacturer);

  const fileTypeFilter = scope === "catalogs" ? "all" : "image";
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  const safeSkip = Math.max(skip, 0);

  try {
    const files = await listImageKitFilesInFolder({
      folderPath,
      limit: safeLimit,
      skip: safeSkip,
      fileTypeFilter,
    });

    return ok({
      folder_path: folderPath,
      scope,
      limit: safeLimit,
      skip: safeSkip,
      count: files.length,
      files,
      may_have_more: files.length >= safeLimit,
    });
  } catch (e) {
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    console.error("imagekit list-folder:", e);
    return err("Failed to list ImageKit media folder", 500);
  }
}
