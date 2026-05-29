import { NextRequest } from "next/server";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, unauthorized } from "@/lib/api-response";
import {
  downloadImageKitFileBuffer,
  findImageKitTemplateForProductType,
  imageKitUploadFailureMessage,
  isImageKitUploadConfigured,
} from "@/lib/imagekit";
import {
  fetchNauticalProductTypeById,
  getNauticalConfig,
  nauticalNotConfiguredMessage,
} from "@/lib/nautical-client";

export const dynamic = "force-dynamic";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

function templateNotFoundMessage(productTypeName: string, slug?: string): string {
  const folder = process.env.IMAGEKIT_TEMPLATES_FOLDER || "/Template-excel-oonni";
  const slugHint = slug ? ` (slug: ${slug})` : "";
  return (
    `No template found in ImageKit for "${productTypeName}"${slugHint}. ` +
    `Check folder "${folder}" for a file like Catalog-Template-${slug ?? "product-type"}.xlsx.`
  );
}

/**
 * POST /api/nautical/catalog-template
 * Resolves the Nautical product type name, finds the matching file in ImageKit (tag: template),
 * and streams the file from its public delivery URL.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return forbidden("Only manufacturer users can download catalog templates.");
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

  let body: { product_type_id?: string };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const productTypeId = typeof body.product_type_id === "string" ? body.product_type_id.trim() : "";
  if (!productTypeId) {
    return err("product_type_id is required", 400);
  }

  try {
    const pt = await fetchNauticalProductTypeById(productTypeId);
    if (!pt) {
      return err("Product type not found", 404);
    }

    const productTypeName = (pt.name ?? "").trim();
    if (!productTypeName) {
      return err("Nautical product type has no name to match against ImageKit templates.", 400);
    }

    const ikTemplate = await findImageKitTemplateForProductType({
      name: productTypeName,
      slug: pt.slug,
    });
    if (!ikTemplate?.url) {
      return err(templateNotFoundMessage(productTypeName, pt.slug), 404);
    }

    const buf = await downloadImageKitFileBuffer(ikTemplate.url);
    const downloadName = ikTemplate.name?.trim() || `${productTypeName}.xlsx`;

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "no-store",
        "X-Template-Source": "imagekit",
        "X-Template-Url": ikTemplate.url,
      },
    });
  } catch (e) {
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    console.error("nautical catalog-template:", e);
    const msg = e instanceof Error ? e.message : "Failed to download template from ImageKit";
    return err(msg, 502);
  }
}
