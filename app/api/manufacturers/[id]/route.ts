import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth(req);
  if (error) return unauthorized(error);

  const { id } = await params;
  const mfr = await prisma.manufacturer.findUnique({ where: { id: parseInt(id, 10) } });
  if (!mfr || mfr.deleted_at) return notFound("Manufacturer not found");
  return ok(mfr);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const manufacturerId = parseInt(id, 10);
  if (!Number.isFinite(manufacturerId) || manufacturerId < 1) return err("Invalid manufacturer id");

  const isAdmin = isAdminUser(user);
  const ownId = effectiveManufacturerId(user);
  if (!isAdmin && ownId !== manufacturerId) return forbidden("You can only update your own manufacturer");

  try {
    const body = await req.json();
    const data: {
      name?: string;
      thumbnail?: string | null;
      imagekit_media_root?: string | null;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return err("name cannot be empty");
      if (name.length > 255) return err("name is too long");
      data.name = name;
    }
    if ("thumbnail" in body) {
      data.thumbnail = body.thumbnail ?? null;
    }
    if (isAdmin && "imagekit_media_root" in body) {
      const v = body.imagekit_media_root;
      data.imagekit_media_root = v == null || v === "" ? null : String(v).trim();
    }

    const mfr = await prisma.manufacturer.update({
      where: { id: manufacturerId },
      data,
    });
    return ok(mfr);
  } catch {
    return notFound("Manufacturer not found");
  }
}
