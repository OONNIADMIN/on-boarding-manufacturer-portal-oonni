import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = (body.password ?? "").trim();

    if (!email || !password) return err("Email and password are required");

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { role: true, manufacturer: true },
    });

    if (!user || !user.password_hash) return err("Incorrect email or password", 401);
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return err("Incorrect email or password", 401);
    if (!user.is_active) return forbidden("Inactive user");

    const token = await signToken({ sub: String(user.id), email: user.email, role: user.role.name });

    return ok({
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_active: user.is_active,
        role_id: user.role_id,
        manufacturer_id: user.manufacturer_id,
        created_at: user.created_at,
        updated_at: user.updated_at,
        role: { id: user.role.id, name: user.role.name },
        manufacturer: user.manufacturer,
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    return err("Login failed", 500);
  }
}
