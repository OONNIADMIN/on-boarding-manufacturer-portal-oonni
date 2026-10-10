import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, notFound, ok, unauthorized } from "@/lib/api-response";
import { inviteAuthorizedDistributor, serializeDistributor } from "@/lib/distributors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);
  if (isAdminUser(user)) {
    return forbidden("Authorized distributors are available to manufacturer accounts");
  }
  const manufacturerId = effectiveManufacturerId(user);
  if (!manufacturerId) return forbidden("Manufacturer is required");

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id) || id < 1) return err("Invalid distributor id");

  const existing = await prisma.authorizedDistributor.findFirst({
    where: { id, manufacturer_id: manufacturerId, deleted_at: null },
  });
  if (!existing) return notFound("Distributor not found");

  const invited = await inviteAuthorizedDistributor({
    distributor: existing,
    brandName: user.manufacturer?.name?.trim() || "Your brand",
  });
  if ("error" in invited) return err(invited.error, 502);

  const updated = await prisma.authorizedDistributor.findFirst({
    where: { id, manufacturer_id: manufacturerId, deleted_at: null },
  });
  if (!updated) return notFound("Distributor not found");

  return ok(serializeDistributor(updated));
}
