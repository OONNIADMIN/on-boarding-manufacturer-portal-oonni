import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { searchParams } = new URL(req.url);
  const manufacturerId = searchParams.get("manufacturer_id");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const isAdmin = user.role.name === "admin";

  const images = await prisma.image.findMany({
    where: {
      deleted_at: null,
      ...(manufacturerId ? { manufacturer_id: parseInt(manufacturerId, 10) } : {}),
      ...(isAdmin ? {} : { manufacturer_id: user.manufacturer_id ?? -1 }),
    },
    include: { manufacturer: true, product: true },
    orderBy: { created_at: "desc" },
    take: limit,
    skip: offset,
  });

  return ok(images);
}
