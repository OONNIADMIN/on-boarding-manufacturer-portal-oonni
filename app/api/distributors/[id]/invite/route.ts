import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, notFound, ok, unauthorized } from "@/lib/api-response";
import { serializeDistributor } from "@/lib/distributors";
import { sendDistributorInvitation } from "@/lib/email";

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

  const brandName = user.manufacturer?.name?.trim() || "Your brand";
  const sent = await sendDistributorInvitation({
    email: existing.email,
    contactName: existing.contact_name,
    companyName: existing.company_name,
    brandName,
  });
  if (!sent) return err("The invitation email could not be sent. Try again later.", 502);

  const updated = await prisma.authorizedDistributor.update({
    where: { id },
    data: {
      status: existing.status === "active" ? "active" : "invite_sent",
      invitation_sent_at: new Date(),
    },
  });

  return ok(serializeDistributor(updated));
}
