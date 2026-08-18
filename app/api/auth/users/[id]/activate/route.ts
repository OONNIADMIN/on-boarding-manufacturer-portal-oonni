import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: admin, error } = await requireAdmin(req);
  if (error || !admin) return unauthorized(error ?? undefined);

  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    if (!Number.isFinite(userId) || userId < 1) return err("Invalid user id");

    const body = await req.json();
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) return err("password is required");
    if (password.length < 8) return err("Password must be at least 8 characters");

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, manufacturer: true },
    });

    if (!target || target.deleted_at) return notFound("User not found");
    if (!target.manufacturer_id) {
      return err("Only manufacturer users can be activated from this action");
    }

    const passwordHash = await hashPassword(password);
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        password_hash: passwordHash,
        is_active: 1,
        invitation_token: null,
        invitation_token_expires_at: null,
        password_set_at: new Date(),
      },
      include: { role: true, manufacturer: true },
    });

    return ok({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      is_active: updated.is_active,
      role_id: updated.role_id,
      manufacturer_id: updated.manufacturer_id,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      role: updated.role,
      manufacturer: updated.manufacturer,
      pending_invitation: false,
    });
  } catch (e) {
    console.error("Activate user error:", e);
    return err("Failed to activate user", 500);
  }
}
