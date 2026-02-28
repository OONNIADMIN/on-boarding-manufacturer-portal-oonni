import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deleteFromImageKit } from "@/lib/imagekit";
import { ok, unauthorized, forbidden, notFound } from "@/lib/api-response";

type Params = { params: Promise<{ key: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const image = await prisma.image.findUnique({
    where: { s3_key: decodedKey },
    include: { manufacturer: true },
  });
  if (!image || image.deleted_at) return notFound("Image not found");

  const isAdmin = user.role.name === "admin";
  const isOwn = user.manufacturer_id === image.manufacturer_id;
  if (!isAdmin && !isOwn) return forbidden("Access denied");

  return ok(image);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const image = await prisma.image.findUnique({ where: { s3_key: decodedKey } });
  if (!image || image.deleted_at) return notFound("Image not found");

  const isAdmin = user.role.name === "admin";
  const isOwn = user.manufacturer_id === image.manufacturer_id;
  if (!isAdmin && !isOwn) return forbidden("Access denied");

  // Delete from ImageKit using fileId (required by ImageKit v7 API)
  const fileIdToDelete = image.imagekit_file_id || image.s3_key;
  try {
    await deleteFromImageKit(fileIdToDelete);
  } catch (e) {
    console.warn("ImageKit delete failed (may already be deleted):", e);
  }

  await prisma.image.delete({ where: { id: image.id } });
  return ok({ message: "Image deleted", image_key: decodedKey });
}
