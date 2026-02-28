import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

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
  const { error } = await requireAuth(req);
  if (error) return unauthorized(error);

  const { id } = await params;
  try {
    const body = await req.json();
    const mfr = await prisma.manufacturer.update({
      where: { id: parseInt(id, 10) },
      data: {
        name: body.name ?? undefined,
        thumbnail: body.thumbnail ?? undefined,
      },
    });
    return ok(mfr);
  } catch {
    return notFound("Manufacturer not found");
  }
}
