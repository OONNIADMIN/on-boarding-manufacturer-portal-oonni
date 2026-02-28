import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  const [manufacturers, recentCatalogs, recentUsers] = await Promise.all([
    prisma.manufacturer.findMany({
      where: { deleted_at: null },
      include: {
        _count: { select: { catalogs: true, images: true, products: true, users: true } },
      },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
    prisma.catalog.findMany({
      where: { deleted_at: null },
      include: { manufacturer: { select: { name: true } } },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
    prisma.user.findMany({
      where: { deleted_at: null },
      include: { role: true },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
  ]);

  return ok({ manufacturers, recentCatalogs, recentUsers });
}
