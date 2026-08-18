import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";

function serializeMe(user: {
  id: number;
  email: string;
  name: string;
  is_active: number;
  role_id: number;
  manufacturer_id: number | null;
  created_at: Date;
  updated_at: Date;
  role: unknown;
  manufacturer: unknown;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    is_active: user.is_active,
    role_id: user.role_id,
    manufacturer_id: user.manufacturer_id,
    created_at: user.created_at,
    updated_at: user.updated_at,
    role: user.role,
    manufacturer: user.manufacturer,
  };
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  return ok(serializeMe(user));
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return err("name is required");
    if (name.length > 255) return err("name is too long");

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name },
      include: { role: true, manufacturer: true },
    });

    return ok(serializeMe(updated));
  } catch (e) {
    console.error("Update profile error:", e);
    return err("Failed to update profile", 500);
  }
}
