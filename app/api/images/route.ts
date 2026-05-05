import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import { serializeImageForListJson } from "@/lib/image-list-json";
import { buildNonAdminImagesWhere } from "@/lib/manufacturer-image-scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireAuth(req);
    if (error || !user) return unauthorized(error ?? undefined);

    const { searchParams } = new URL(req.url);
    const manufacturerId = searchParams.get("manufacturer_id");
    const productId = searchParams.get("product_id");
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const isAdmin = isAdminUser(user);

    const productClause = productId ? { product_id: parseInt(productId, 10) } : {};
    const visibility = isAdmin ? {} : await buildNonAdminImagesWhere(user);
    const where = isAdmin
      ? {
          deleted_at: null as null,
          ...productClause,
          ...(manufacturerId ? { manufacturer_id: parseInt(manufacturerId, 10) } : {}),
        }
      : {
          deleted_at: null as null,
          ...productClause,
          ...visibility,
        };

    const [images, total] = await Promise.all([
      prisma.image.findMany({
        where,
        include: { manufacturer: true, product: true },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.image.count({ where }),
    ]);

    return ok({
      total_images: total,
      images: images.map(serializeImageForListJson),
    });
  } catch (e) {
    console.error("[GET /api/images]", e);
    const message =
      e instanceof Error ? e.message : "Failed to load images. Check server logs and database connection.";
    return serverError(message);
  }
}
