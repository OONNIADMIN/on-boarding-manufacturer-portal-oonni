import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, created, err, unauthorized } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return unauthorized(error);

  const { searchParams } = new URL(req.url);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);
  const limit = parseInt(searchParams.get("limit") ?? "100", 10);

  const manufacturers = await prisma.manufacturer.findMany({
    where: { deleted_at: null },
    skip,
    take: limit,
    orderBy: { id: "asc" },
  });
  return ok(manufacturers);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(req);
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
    return created(mfr);
  } catch (e) {
    console.error("Create manufacturer error:", e);
    return err("Failed to create manufacturer", 500);
  }
}
