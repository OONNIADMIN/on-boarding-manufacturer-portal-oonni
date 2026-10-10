import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, notFound, ok, unauthorized } from "@/lib/api-response";
import { parseDistributorFields, serializeDistributor } from "@/lib/distributors";

async function manufacturerScope(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return { error: unauthorized(error ?? undefined) as Response };
  if (isAdminUser(user)) {
    return { error: forbidden("Authorized distributors are available to manufacturer accounts") as Response };
  }
  const manufacturerId = effectiveManufacturerId(user);
  if (!manufacturerId) return { error: forbidden("Manufacturer is required") as Response };
  return { user, manufacturerId };
}

async function loadOwned(manufacturerId: number, id: number) {
  return prisma.authorizedDistributor.findFirst({
    where: { id, manufacturer_id: manufacturerId, deleted_at: null },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await manufacturerScope(req);
  if ("error" in scoped) return scoped.error;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id) || id < 1) return err("Invalid distributor id");

  const existing = await loadOwned(scoped.manufacturerId, id);
  if (!existing) return notFound("Distributor not found");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return err("Invalid JSON");
  const parsed = parseDistributorFields(body, true);
  if ("error" in parsed) return err(parsed.error);

  if (parsed.email && parsed.email !== existing.email) {
    const duplicate = await prisma.authorizedDistributor.findFirst({
      where: {
        manufacturer_id: scoped.manufacturerId,
        email: parsed.email,
        deleted_at: null,
        NOT: { id },
      },
    });
    if (duplicate) return err("A distributor with this email already exists", 409);
  }

  const updated = await prisma.authorizedDistributor.update({
    where: { id },
    data: {
      ...(parsed.company_name !== undefined ? { company_name: parsed.company_name } : {}),
      ...(parsed.contact_name !== undefined ? { contact_name: parsed.contact_name } : {}),
      ...(parsed.email !== undefined ? { email: parsed.email } : {}),
      ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
      ...(parsed.region !== undefined ? { region: parsed.region } : {}),
      ...(parsed.valid_until !== undefined ? { valid_until: parsed.valid_until } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    },
  });

  return ok(serializeDistributor(updated));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await manufacturerScope(req);
  if ("error" in scoped) return scoped.error;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id) || id < 1) return err("Invalid distributor id");

  const existing = await loadOwned(scoped.manufacturerId, id);
  if (!existing) return notFound("Distributor not found");

  await prisma.authorizedDistributor.update({
    where: { id },
    data: { deleted_at: new Date() },
  });

  return ok({ ok: true });
}
