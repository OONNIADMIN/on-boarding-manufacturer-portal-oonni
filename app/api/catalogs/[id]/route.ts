import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

function checkAccess(user: { role: { name: string }; manufacturer_id: number | null }, catalog: { manufacturer_id: number }) {
  const isAdmin = user.role.name === "admin";
  const isOwn = user.manufacturer_id === catalog.manufacturer_id;
  return isAdmin || isOwn;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const catalog = await prisma.catalog.findUnique({
    where: { id: parseInt(id, 10) },
    include: { manufacturer: true },
  });
  if (!catalog || catalog.deleted_at) return notFound("Catalog not found");
  if (!checkAccess(user, catalog)) return forbidden("Access denied");
  return ok(catalog);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const catalog = await prisma.catalog.findUnique({ where: { id: parseInt(id, 10) } });
  if (!catalog || catalog.deleted_at) return notFound("Catalog not found");
  if (!checkAccess(user, catalog)) return forbidden("Access denied");

  await prisma.catalog.delete({ where: { id: catalog.id } });
  return ok({ message: "Catalog deleted successfully", catalog_id: catalog.id });
}
