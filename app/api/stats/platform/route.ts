import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  const [totalManufacturers, totalUsers, totalCatalogs, totalImages,
         recentManufacturers, recentUsers, recentCatalogs, recentImages] = await Promise.all([
    prisma.manufacturer.count({ where: { deleted_at: null } }),
    prisma.user.count({ where: { deleted_at: null } }),
    prisma.catalog.count({ where: { deleted_at: null } }),
    prisma.image.count({ where: { deleted_at: null } }),
    prisma.manufacturer.count({ where: { deleted_at: null, created_at: { gte: daysAgo(7) } } }),
    prisma.user.count({ where: { deleted_at: null, created_at: { gte: daysAgo(7) } } }),
    prisma.catalog.count({ where: { deleted_at: null, created_at: { gte: daysAgo(7) } } }),
    prisma.image.count({ where: { deleted_at: null, created_at: { gte: daysAgo(7) } } }),
  ]);

  return ok({
    totalManufacturers,
    totalUsers,
    totalCatalogs,
    totalImages,
    recentActivity: {
      newManufacturers: recentManufacturers,
      newUsers: recentUsers,
      newCatalogs: recentCatalogs,
      newImages: recentImages,
    },
  });
}
