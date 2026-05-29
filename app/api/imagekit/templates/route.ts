import { NextRequest } from "next/server";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, ok, unauthorized } from "@/lib/api-response";
import {
  findImageKitTemplateForProductType,
  imageKitUploadFailureMessage,
  isImageKitUploadConfigured,
  resolveImageKitTemplatesForNauticalProductTypes,
} from "@/lib/imagekit";
import {
  fetchAllNauticalProductTypes,
  fetchNauticalProductTypeById,
  getNauticalConfig,
  nauticalNotConfiguredMessage,
} from "@/lib/nautical-client";

export const dynamic = "force-dynamic";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

/**
 * GET /api/imagekit/templates
 * Template names come from Nautical product types; ImageKit files are matched by that name (tag: template).
 *
 * Query params:
 *   - product_type_id (optional): single Nautical product type
 *   - name (optional): filter Nautical product types by name (case-insensitive contains)
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return forbidden("Only manufacturer users can access catalog templates.");
  }

  if (!getNauticalConfig()) {
    return err(nauticalNotConfiguredMessage(), 503);
  }

  if (!isImageKitUploadConfigured()) {
    return err(
      "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY in the server environment.",
      503
    );
  }

  const { searchParams } = new URL(req.url);
  const productTypeId = searchParams.get("product_type_id")?.trim() ?? "";
  const nameFilter = searchParams.get("name")?.trim().toLowerCase() ?? "";

  try {
    if (productTypeId) {
      const pt = await fetchNauticalProductTypeById(productTypeId);
      if (!pt) return err("Product type not found", 404);

      const template = await findImageKitTemplateForProductType({
        name: pt.name,
        slug: pt.slug,
      });

      return ok({
        product_type: {
          id: pt.id,
          slug: pt.slug,
          name: pt.name,
          template_search_name: (pt.name ?? "").trim() || (pt.slug ?? "").trim(),
          template,
        },
      });
    }

    const nodes = await fetchAllNauticalProductTypes();
    let productTypes = nodes.map((n) => ({ id: n.id, slug: n.slug, name: n.name }));

    if (nameFilter) {
      productTypes = productTypes.filter(
        (pt) =>
          pt.name.toLowerCase().includes(nameFilter) ||
          pt.slug.toLowerCase().includes(nameFilter)
      );
    }

    const templates = await resolveImageKitTemplatesForNauticalProductTypes(productTypes);

    return ok({
      count: templates.length,
      product_types: templates,
    });
  } catch (e) {
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    console.error("imagekit templates:", e);
    const msg = e instanceof Error ? e.message : "Failed to resolve templates";
    return err(msg, 502);
  }
}
