import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

interface UserRow {
  id: number;
  email: string;
  name: string;
  is_active: number;
  role_id: number;
  manufacturer_id: number | null;
  created_at: Date;
  updated_at: Date;
  role: { id: number; name: string } | null;
  manufacturer: { id: number; name: string; slug: string } | null;
  invitation_token: string | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth(req);
  if (error) return unauthorized(error);

  const { id } = await params;
  const users = (await prisma.user.findMany({
    where: { manufacturer_id: parseInt(id, 10) },
    include: { role: true, manufacturer: true },
    orderBy: { id: "asc" },
  })) as unknown as UserRow[];

  return ok(
    users.map((u: UserRow) => ({
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
      pending_invitation: u.invitation_token !== null,
    }))
  );
}
