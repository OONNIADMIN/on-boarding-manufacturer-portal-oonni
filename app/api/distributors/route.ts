import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { created, err, forbidden, ok, unauthorized } from "@/lib/api-response";
import { inviteAuthorizedDistributor, parseDistributorFields, serializeDistributor } from "@/lib/distributors";

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

  const createdRow = await prisma.authorizedDistributor.create({
    data: {
      manufacturer_id: scoped.manufacturerId,
      company_name: parsed.company_name,
      contact_name: parsed.contact_name,
      email: parsed.email,
      phone: parsed.phone ?? null,
      region: parsed.region ?? null,
      valid_until: parsed.valid_until ?? null,
      status: parsed.status ?? "not_invited",
    },
  });

  if (parsed.send_invite) {
    const invited = await inviteAuthorizedDistributor({
      distributor: createdRow,
      brandName: scoped.user.manufacturer?.name?.trim() || "Your brand",
    });
    if ("error" in invited) return err(invited.error, 502);
    const updated = await prisma.authorizedDistributor.findFirst({
      where: { id: createdRow.id, deleted_at: null },
    });
    return created(serializeDistributor(updated ?? createdRow));
  }

  return created(serializeDistributor(createdRow));
}
