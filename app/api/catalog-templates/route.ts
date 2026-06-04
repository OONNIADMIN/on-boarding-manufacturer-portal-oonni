import { NextRequest } from "next/server";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, ok, unauthorized } from "@/lib/api-response";
import {
  catalogDamTemplateListErrorMessage,
  listCatalogDamTemplatesFromImageKit,
} from "@/lib/catalog-dam-templates";
import { isImageKitUploadConfigured } from "@/lib/imagekit";

export const dynamic = "force-dynamic";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return forbidden("Only manufacturer users can list catalog templates.");
  }

  if (!isImageKitUploadConfigured()) {
    return err(
      "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY in the server environment.",
      503
    );
  }

  try {
    const templates = await listCatalogDamTemplatesFromImageKit();
    return ok({
      templates: templates.map(({ id, name, slug }) => ({ id, name, slug })),
    });
  } catch (e) {
    const hint = catalogDamTemplateListErrorMessage(e);
    if (hint) return err(hint, 503);
    console.error("catalog-templates list:", e);
    const msg = e instanceof Error ? e.message : "Failed to load catalog templates";
    return err(msg, 502);
  }
}
