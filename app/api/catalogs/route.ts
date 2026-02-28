import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { searchParams } = new URL(req.url);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);
  const limit = parseInt(searchParams.get("limit") ?? "100", 10);

  const isAdmin = user.role.name === "admin";
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
