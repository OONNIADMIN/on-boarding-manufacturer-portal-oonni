import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateInvitationToken, getInvitationTokenExpiry } from "@/lib/auth";
import { sendManufacturerInvitation } from "@/lib/email";
import { created, err, unauthorized } from "@/lib/api-response";
import { slugify } from "@/lib/slugify";
import { ensureManufacturerImageKitFolders } from "@/lib/imagekit";
import { unexpectedError, recordSystemOk, recordSystemError } from "@/lib/error-log";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
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

    let manufacturer = manufacturer_id
      ? await prisma.manufacturer.findUnique({ where: { id: manufacturer_id } })
      : null;
    if (manufacturer_id && !manufacturer) return err("Manufacturer not found", 404);

    if (!manufacturer) {
      let slug = slugify(name);
      const base = slug;
      let i = 1;
      while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${base}-${i++}`;
      manufacturer = await prisma.manufacturer.create({ data: { name: name.trim(), slug } });
    }

    await ensureManufacturerImageKitFolders(manufacturer);

    const token = generateInvitationToken();
    const expiresAt = getInvitationTokenExpiry();

    const newUser = await prisma.user.create({
      data: {
        email: emailNorm,
        name: name.trim(),
        password_hash: null,
        role_id: mfrRole.id,
        manufacturer_id: manufacturer.id,
        is_active: 0,
        invitation_token: token,
        invitation_token_expires_at: expiresAt,
      },
      include: { role: true, manufacturer: true },
    });

    recordSystemOk(
      `Manufacturer invitation created for ${emailNorm}; marketplace user id left empty until password is set`,
      {
        source: "invite-manufacturer",
        path: "/api/auth/invite-manufacturer",
        userId: newUser.id,
        manufacturerId: manufacturer.id,
      }
    );

    const emailSent = await sendManufacturerInvitation(emailNorm, name.trim(), token);
    if (!emailSent) {
      console.error("[invite-manufacturer] Email not sent for", emailNorm);
      recordSystemError("Invitation email was not sent", {
        source: "invite-manufacturer",
        path: "/api/auth/invite-manufacturer",
        userId: newUser.id,
        manufacturerId: manufacturer.id,
      });
    } else {
      recordSystemOk(`Invitation email sent to ${emailNorm}`, {
        source: "invite-manufacturer",
        path: "/api/auth/invite-manufacturer",
        userId: newUser.id,
        manufacturerId: manufacturer.id,
      });
    }

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
    return unexpectedError(e, {
      source: "invite-manufacturer",
      path: "/api/auth/invite-manufacturer",
      userId: user?.id ?? null,
    });
  }
}
