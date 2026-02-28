import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  return ok({
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
  });
}
