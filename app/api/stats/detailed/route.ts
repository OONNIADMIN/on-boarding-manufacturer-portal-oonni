import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function startOfUtcMonth(monthsAgo: number): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d;
}

function bucketByMonth(dates: Date[], oldestMonth: Date): number[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const date of dates) {
    const index =
      (date.getUTCFullYear() - oldestMonth.getUTCFullYear()) * 12 +
      (date.getUTCMonth() - oldestMonth.getUTCMonth());
    if (index >= 0 && index < 12) counts[index] += 1;
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  const weekAgo = daysAgo(7);
  const oldestMonth = startOfUtcMonth(11);
  const notDeleted = { deleted_at: null };

  const [
    totalManufacturers,
    totalUsers,
    totalCatalogs,
    totalImages,
    recentManufacturers,
    recentUsers,
    recentCatalogs,
    recentImages,
    adminCount,
    manufacturerUserCount,
    topManufacturerRows,
    manufacturerCreated,
    userCreated,
    catalogCreated,
    imageCreated,
  ] = await Promise.all([
    prisma.manufacturer.count({ where: notDeleted }),
    prisma.user.count({ where: notDeleted }),
    prisma.catalog.count({ where: notDeleted }),
    prisma.image.count({ where: notDeleted }),
    prisma.manufacturer.count({ where: { ...notDeleted, created_at: { gte: weekAgo } } }),
    prisma.user.count({ where: { ...notDeleted, created_at: { gte: weekAgo } } }),
    prisma.catalog.count({ where: { ...notDeleted, created_at: { gte: weekAgo } } }),
    prisma.image.count({ where: { ...notDeleted, created_at: { gte: weekAgo } } }),
    prisma.user.count({ where: { ...notDeleted, role: { name: "admin" } } }),
    prisma.user.count({ where: { ...notDeleted, role: { name: "manufacturer" } } }),
    prisma.manufacturer.findMany({
      where: notDeleted,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            users: { where: notDeleted },
            catalogs: { where: notDeleted },
          },
        },
      },
      orderBy: { catalogs: { _count: "desc" } },
      take: 10,
    }),
    prisma.manufacturer.findMany({
      where: { ...notDeleted, created_at: { gte: oldestMonth } },
      select: { created_at: true },
    }),
    prisma.user.findMany({
      where: { ...notDeleted, created_at: { gte: oldestMonth } },
      select: { created_at: true },
    }),
    prisma.catalog.findMany({
      where: { ...notDeleted, created_at: { gte: oldestMonth } },
      select: { created_at: true },
    }),
    prisma.image.findMany({
      where: { ...notDeleted, created_at: { gte: oldestMonth } },
      select: { created_at: true },
    }),
  ]);

  const otherUsers = Math.max(0, totalUsers - adminCount - manufacturerUserCount);

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
    monthlyStats: {
      manufacturers: bucketByMonth(
        manufacturerCreated.map((row) => row.created_at),
        oldestMonth
      ),
      users: bucketByMonth(
        userCreated.map((row) => row.created_at),
        oldestMonth
      ),
      catalogs: bucketByMonth(
        catalogCreated.map((row) => row.created_at),
        oldestMonth
      ),
      images: bucketByMonth(
        imageCreated.map((row) => row.created_at),
        oldestMonth
      ),
    },
    topManufacturers: topManufacturerRows.map((row) => ({
      id: row.id,
      name: row.name,
      userCount: row._count.users,
      catalogCount: row._count.catalogs,
    })),
    userDistribution: {
      admins: adminCount,
      manufacturers: manufacturerUserCount,
      users: otherUsers,
    },
  });
}
