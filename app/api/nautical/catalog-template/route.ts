import { NextRequest } from "next/server";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, unauthorized } from "@/lib/api-response";
import {
  fetchCategoriesForTemplateSearch,
  fetchNauticalProductTypeById,
  getNauticalConfig,
  nauticalNotConfiguredMessage,
} from "@/lib/nautical-client";
import {
  buildMergedTemplateHeaders,
  getPriorityColumnDefinitions,
  safeTemplateFilename,
} from "@/lib/nautical-catalog-template";
import { buildNauticalCatalogExcelBuffer } from "@/lib/nautical-excel-template";

export const dynamic = "force-dynamic";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return forbidden("Only manufacturer users can download catalog templates.");
  }

  if (!getNauticalConfig()) {
    return err(nauticalNotConfiguredMessage(), 503);
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

    const priority = getPriorityColumnDefinitions();
    const headers = buildMergedTemplateHeaders(
      priority,
      pt.productAttributes ?? [],
      pt.variantAttributes ?? []
    );

    const templateSearchKey = (pt.name ?? "").trim() || (pt.slug ?? "").trim();
    const categoryRows = await fetchCategoriesForTemplateSearch(templateSearchKey);

    const buf = await buildNauticalCatalogExcelBuffer({
      headers,
      categoryRows,
      templateName: templateSearchKey || pt.slug || "product-type",
    });
    const filename = safeTemplateFilename(pt.slug || "product-type");

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("nautical catalog-template:", e);
    const msg = e instanceof Error ? e.message : "Failed to build template";
    return err(msg, 502);
  }
}
