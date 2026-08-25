import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signToken, isInvitationTokenExpired } from "@/lib/auth";
import { ok, err, tooManyRequests } from "@/lib/api-response";
import { applySessionCookie, clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, SET_PASSWORD_LIMIT, consumeRateLimit } from "@/lib/rate-limit";
import { passwordPolicyError } from "@/lib/password-policy";
import { contentLengthTooLarge } from "@/lib/request-limits";

export async function POST(req: NextRequest) {
  try {
    if (contentLengthTooLarge(req, 16_384, 0)) return err("Request too large", 413);
    const ip = clientIp(req);
    if (!consumeRateLimit(`set-password:${ip}`, SET_PASSWORD_LIMIT, AUTH_WINDOW_MS)) {
      return tooManyRequests("Too many attempts. Try again in 15 minutes.");
    }

    const { token: rawToken, password } = await req.json();

    if (!rawToken || !password) return err("token and password are required");
    const policyError = passwordPolicyError(String(password));
    if (policyError) return err(policyError);

    const token = typeof rawToken === "string" ? rawToken.trim() : "";

    const user = await prisma.user.findUnique({
      where: { invitation_token: token },
      include: { role: true, manufacturer: true },
    });

    if (!user) return err("Invalid invitation token", 400);
    if (isInvitationTokenExpired(user.invitation_token_expires_at)) return err("Invitation token has expired", 400);
    if (user.is_active) return err("This invitation has already been used", 400);

    const passwordHash = await hashPassword(password);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        is_active: 1,
        invitation_token: null,
        invitation_token_expires_at: null,
        password_set_at: new Date(),
      },
      include: { role: true, manufacturer: true },
    });

    const accessToken = await signToken({
      sub: String(updated.id),
      email: updated.email,
      role: updated.role.name,
    });

    const res = ok({
      token_type: "bearer",
      user: {
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
      },
    });
    return applySessionCookie(res, accessToken);
  } catch (e) {
    console.error("Set password error:", e);
    return err("Failed to set password", 500);
  }
}
