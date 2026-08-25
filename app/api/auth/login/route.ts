import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { ok, err, tooManyRequests } from "@/lib/api-response";
import { applySessionCookie, clientIp } from "@/lib/session-cookie";
import { contentLengthTooLarge } from "@/lib/request-limits";
import { LOGIN_FAILURE_DETAIL, consumeLoginAttempt, passwordsMatch } from "@/lib/login-guard";

export async function POST(req: NextRequest) {
  try {
    if (contentLengthTooLarge(req, 16_384, 0)) return err("Request too large", 413);
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = (body.password ?? "").trim();
    const ip = clientIp(req);

    if (!consumeLoginAttempt(ip, email)) {
      return tooManyRequests("Too many login attempts. Try again in 15 minutes.");
    }

    if (!email || !password) return err("Email and password are required");

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { role: true, manufacturer: true },
    });

    const valid = await passwordsMatch(password, user?.password_hash);
    if (!valid || !user || !user.is_active) {
      return err(LOGIN_FAILURE_DETAIL, 401);
    }

    const token = await signToken({ sub: String(user.id), email: user.email, role: user.role.name });

    const res = ok({
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
    return applySessionCookie(res, token);
  } catch (e) {
    console.error("Login error:", e);
    return err("Login failed", 500);
  }
}
