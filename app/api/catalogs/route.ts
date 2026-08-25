import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { parseBoundedInt } from "@/lib/bounded-int";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { searchParams } = new URL(req.url);
  const skip = parseBoundedInt(searchParams.get("skip"), 0, 0, 10_000);
  const limit = parseBoundedInt(searchParams.get("limit"), 100, 1, 500);

  const isAdmin = isAdminUser(user);
  const catalogs = await prisma.catalog.findMany({
    where: {
      deleted_at: null,
      ...(isAdmin ? {} : { manufacturer_id: user.manufacturer_id ?? -1 }),
    },
    include: { manufacturer: true },
    skip,
    take: limit,
    orderBy: { created_at: "desc" },
  });

  return ok(catalogs);
}
