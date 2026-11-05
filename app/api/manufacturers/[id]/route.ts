import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAdmin, requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { deleteManufacturerAndRelatedData, ManufacturerDeleteError } from "@/lib/delete-manufacturer";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const manufacturerId = parseInt(id, 10);
  if (!Number.isFinite(manufacturerId) || manufacturerId < 1) return err("Invalid manufacturer id");

  const isAdmin = isAdminUser(user);
  const ownId = effectiveManufacturerId(user);
  if (!isAdmin && ownId !== manufacturerId) return forbidden("Access denied");

  const mfr = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
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

export async function DELETE(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAdmin(req);
  if (error === "Admin access required") return forbidden(error);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const manufacturerId = parseInt(id, 10);
  if (!Number.isFinite(manufacturerId) || manufacturerId < 1) return err("Invalid manufacturer id");

  try {
    const result = await deleteManufacturerAndRelatedData(manufacturerId, { actorUserId: user.id });
    return ok(result);
  } catch (cause) {
    if (cause instanceof ManufacturerDeleteError) {
      if (cause.status === 404) return notFound(cause.message);
      return err(cause.message, cause.status);
    }
    console.error("Delete manufacturer error:", cause);
    return err("Failed to delete manufacturer", 500, cause);
  }
}
