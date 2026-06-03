import { NextRequest, NextResponse } from "next/server";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, notFound, unauthorized } from "@/lib/api-response";
import { resolveCatalogTemplateDownload } from "@/lib/catalog-dam-templates";

export const dynamic = "force-dynamic";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return forbidden("Only manufacturer users can download catalog templates.");
  }

  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return err("id is required", 400);

  const resolved = await resolveCatalogTemplateDownload(id);
  if (!resolved) return notFound("Unknown template");

  try {
    const upstream = await fetch(resolved.url, { cache: "no-store" });
    if (!upstream.ok) {
      return err("Template file unavailable from media library", 502);
    }
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${resolved.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (e) {
    console.error("catalog-templates/download:", e);
    return err("Failed to fetch template", 502);
  }
}
