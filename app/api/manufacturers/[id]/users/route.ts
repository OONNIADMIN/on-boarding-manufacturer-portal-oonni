import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import type { Prisma } from "@prisma/client";

type UserWithRelations = Prisma.UserGetPayload<{
  include: { role: true; manufacturer: true };
}>;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth(req);
  if (error) return unauthorized(error);

  const { id } = await params;
  const users: UserWithRelations[] = await prisma.user.findMany({
    where: { manufacturer_id: parseInt(id, 10) },
    include: { role: true, manufacturer: true },
    orderBy: { id: "asc" },
  });

  return ok(
    users.map((u: UserWithRelations) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      is_active: u.is_active,
      role_id: u.role_id,
      manufacturer_id: u.manufacturer_id,
      created_at: u.created_at,
      updated_at: u.updated_at,
      role: u.role,
      manufacturer: u.manufacturer,
      pending_invitation: !!u.invitation_token,
    }))
  );
}
