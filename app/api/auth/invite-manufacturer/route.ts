import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateInvitationToken, getInvitationTokenExpiry } from "@/lib/auth";
import { sendManufacturerInvitation } from "@/lib/email";
import { created, err, unauthorized } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  try {
    const body = await req.json();
    const { email, name, manufacturer_id } = body;

    if (!email || !name) return err("email and name are required");

    const emailNorm = email.trim().toLowerCase();
    const exists = await prisma.user.findFirst({ where: { email: { equals: emailNorm, mode: "insensitive" } } });
    if (exists) return err("User with this email already exists");

    const mfrRole = await prisma.role.findUnique({ where: { name: "manufacturer" } });
    if (!mfrRole) return err("Manufacturer role not found", 500);

    let mfrId: number;
    if (manufacturer_id) {
      const mfr = await prisma.manufacturer.findUnique({ where: { id: manufacturer_id } });
      if (!mfr) return err("Manufacturer not found", 404);
      mfrId = mfr.id;
    } else {
      let slug = slugify(name);
      const base = slug;
      let i = 1;
      while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${base}-${i++}`;
      const mfr = await prisma.manufacturer.create({ data: { name: name.trim(), slug } });
      mfrId = mfr.id;
    }

    const token = generateInvitationToken();
    const expiresAt = getInvitationTokenExpiry();

    const newUser = await prisma.user.create({
      data: {
        email: emailNorm,
        name: name.trim(),
        password_hash: null,
        role_id: mfrRole.id,
        manufacturer_id: mfrId,
        is_active: 0,
        invitation_token: token,
        invitation_token_expires_at: expiresAt,
      },
      include: { role: true, manufacturer: true },
    });

    // Awaitar el envío garantiza que el token en el correo == token en DB.
    // Si el envío falla, se loguea pero igual se retorna el usuario creado.
    const emailSent = await sendManufacturerInvitation(emailNorm, name.trim(), token);
    if (!emailSent) console.error("[invite-manufacturer] Email not sent for", emailNorm);

    return created({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      is_active: newUser.is_active,
      role_id: newUser.role_id,
      manufacturer_id: newUser.manufacturer_id,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
      role: newUser.role,
      manufacturer: newUser.manufacturer,
    });
  } catch (e) {
    console.error("Invite manufacturer error:", e);
    return err("Failed to invite manufacturer", 500);
  }
}
