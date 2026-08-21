import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAdmin, requireAuth } from "@/lib/auth";
import { ok, created, err, unauthorized, forbidden } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";
import { ensureManufacturerImageKitFolders } from "@/lib/imagekit";
import { parseBoundedInt } from "@/lib/bounded-int";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { searchParams } = new URL(req.url);
  const skip = parseBoundedInt(searchParams.get("skip"), 0, 0, 10_000);
  const limit = parseBoundedInt(searchParams.get("limit"), 100, 1, 200);

  if (isAdminUser(user)) {
    const manufacturers = await prisma.manufacturer.findMany({
      where: { deleted_at: null },
      skip,
      take: limit,
      orderBy: { id: "asc" },
    });
    return ok(manufacturers);
  }

  const ownId = effectiveManufacturerId(user);
  if (!ownId) return ok([]);
  const own = await prisma.manufacturer.findMany({
    where: { id: ownId, deleted_at: null },
    take: 1,
  });
  return ok(own);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error === "Admin access required") return forbidden(error);
  if (error) return unauthorized(error);

  try {
    const body = await req.json();
    const { name, thumbnail } = body;
    if (!name) return err("name is required");

    let slug = slugify(name);
    const base = slug;
    let i = 1;
    while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${base}-${i++}`;

    const mfr = await prisma.manufacturer.create({
      data: { name: name.trim(), slug, thumbnail: thumbnail ?? null },
    });
    await ensureManufacturerImageKitFolders(mfr);
    return created(mfr);
  } catch (e) {
    console.error("Create manufacturer error:", e);
    return err("Failed to create manufacturer", 500);
  }
}
