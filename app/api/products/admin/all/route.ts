import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { withCanonicalImageUrl } from "@/lib/imagekit";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  const { searchParams } = new URL(req.url);
  const manufacturerId = searchParams.get("manufacturer_id");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: {
        deleted_at: null,
        ...(manufacturerId ? { manufacturer_id: parseInt(manufacturerId, 10) } : {}),
      },
      include: { manufacturer: true, catalog: true, images: true },
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.product.count({
      where: {
        deleted_at: null,
        ...(manufacturerId ? { manufacturer_id: parseInt(manufacturerId, 10) } : {}),
      },
    }),
  ]);

  const productsOut = products.map((p) => ({
    ...p,
    images: p.images.map(withCanonicalImageUrl),
  }));

  return ok({ products: productsOut, total, limit, offset });
}
