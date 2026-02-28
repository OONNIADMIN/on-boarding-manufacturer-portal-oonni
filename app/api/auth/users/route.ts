import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { ok, created, err, unauthorized, forbidden, slugify } from "@/lib/api-response";

// Serializes a user with role and manufacturer
function serializeUser(u: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    is_active: u.is_active,
    role_id: u.role_id,
    manufacturer_id: u.manufacturer_id,
    created_at: u.created_at,
    updated_at: u.updated_at,
    role: (u as { role?: unknown }).role ?? null,
    manufacturer: (u as { manufacturer?: unknown }).manufacturer ?? null,
  };
}

export async function GET(req: NextRequest) {
  const { user: admin, error } = await requireAdmin(req);
  if (error || !admin) return unauthorized(error ?? undefined);

  const users = await prisma.user.findMany({
    include: { role: true, manufacturer: true },
    orderBy: { id: "asc" },
  });
  return ok(users.map(serializeUser));
}

export async function POST(req: NextRequest) {
  const { user: admin, error } = await requireAdmin(req);
  if (error || !admin) return unauthorized(error ?? undefined);

  try {
    const body = await req.json();
    const { email, name, password, role_id, manufacturer_id } = body;

    if (!email || !name || !role_id) return err("email, name and role_id are required");

    const exists = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } } });
    if (exists) return err("User with this email already exists");

    const role = await prisma.role.findUnique({ where: { id: role_id } });
    if (!role) return err("Role not found", 404);

    let mfrId = manufacturer_id ?? null;
    if (role.name === "manufacturer" && !mfrId) {
      let slug = slugify(name);
      const base = slug;
      let i = 1;
      while (await prisma.manufacturer.findUnique({ where: { slug } })) slug = `${base}-${i++}`;
      const mfr = await prisma.manufacturer.create({ data: { name, slug } });
      mfrId = mfr.id;
    }

    const newUser = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        password_hash: password ? await hashPassword(password) : null,
        role_id,
        manufacturer_id: mfrId,
        is_active: 1,
      },
      include: { role: true, manufacturer: true },
    });

    return created(serializeUser(newUser));
  } catch (e) {
    console.error("Create user error:", e);
    return err("Failed to create user", 500);
  }
}
