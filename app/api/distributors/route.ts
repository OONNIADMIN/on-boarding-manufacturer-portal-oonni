import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { created, err, forbidden, ok, unauthorized } from "@/lib/api-response";
import { parseDistributorFields, serializeDistributor } from "@/lib/distributors";
import { sendDistributorInvitation } from "@/lib/email";

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

export async function GET(req: NextRequest) {
  const scoped = await manufacturerScope(req);
  if ("error" in scoped) return scoped.error;

  const rows = await prisma.authorizedDistributor.findMany({
    where: { manufacturer_id: scoped.manufacturerId, deleted_at: null },
    orderBy: { company_name: "asc" },
  });

  return ok(rows.map(serializeDistributor));
}

export async function POST(req: NextRequest) {
  const scoped = await manufacturerScope(req);
  if ("error" in scoped) return scoped.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return err("Invalid JSON");
  const parsed = parseDistributorFields(body);
  if ("error" in parsed) return err(parsed.error);
  if (!parsed.company_name || !parsed.contact_name || !parsed.email) {
    return err("company_name, contact_name and email are required");
  }

  const duplicate = await prisma.authorizedDistributor.findFirst({
    where: {
      manufacturer_id: scoped.manufacturerId,
      email: parsed.email,
      deleted_at: null,
    },
  });
  if (duplicate) return err("A distributor with this email already exists", 409);

  let status = parsed.status ?? "not_invited";
  let invitationSentAt: Date | null = null;
  if (parsed.send_invite) {
    const brandName = scoped.user.manufacturer?.name?.trim() || "Your brand";
    const sent = await sendDistributorInvitation({
      email: parsed.email,
      contactName: parsed.contact_name,
      companyName: parsed.company_name,
      brandName,
    });
    if (sent) {
      status = "invite_sent";
      invitationSentAt = new Date();
    }
  }

  const createdRow = await prisma.authorizedDistributor.create({
    data: {
      manufacturer_id: scoped.manufacturerId,
      company_name: parsed.company_name,
      contact_name: parsed.contact_name,
      email: parsed.email,
      phone: parsed.phone ?? null,
      region: parsed.region ?? null,
      valid_until: parsed.valid_until ?? null,
      status,
      invitation_sent_at: invitationSentAt,
    },
  });

  return created(serializeDistributor(createdRow));
}
