import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const body = await req.json();
    const { image_keys, product_id } = body;

    if (!Array.isArray(image_keys) || !product_id) {
      return err("image_keys (array) and product_id are required");
    }

    const product = await prisma.product.findUnique({ where: { id: product_id } });
    if (!product) return err("Product not found", 404);

    const updated = await prisma.image.updateMany({
      where: { s3_key: { in: image_keys } },
      data: { product_id },
    });

    return ok({ message: "Images assigned to product", updated_count: updated.count, product_id });
  } catch (e) {
    console.error("Bulk assign error:", e);
    return err("Failed to assign images", 500);
  }
}
