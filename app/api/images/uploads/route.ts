import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { serializeImageForListJson } from "@/lib/image-list-json";
import { buildNonAdminImagesWhere } from "@/lib/manufacturer-image-scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const isAdmin = isAdminUser(user);
  const visibility = isAdmin ? {} : await buildNonAdminImagesWhere(user);

  const where = {
    deleted_at: null as null,
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
}
