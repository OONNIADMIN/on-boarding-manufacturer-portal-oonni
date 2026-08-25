import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isInvitationTokenExpired } from "@/lib/auth";
import { ok, tooManyRequests } from "@/lib/api-response";
import { clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, VERIFY_INVITE_LIMIT, consumeRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (!consumeRateLimit(`verify-invite:${ip}`, VERIFY_INVITE_LIMIT, AUTH_WINDOW_MS)) {
    return tooManyRequests();
  }
  const { token: rawToken } = await params;
  const token = typeof rawToken === "string" ? rawToken.trim() : "";

  if (!token) return ok({ valid: false, message: "Invalid invitation token" });

  const user = await prisma.user.findUnique({ where: { invitation_token: token } });

  if (!user) return ok({ valid: false, message: "Invalid invitation token" });

  if (isInvitationTokenExpired(user.invitation_token_expires_at)) {
    return ok({ valid: false, expired: true, message: "Invitation token has expired" });
  }

  if (user.is_active) {
    return ok({ valid: false, message: "This invitation has already been used" });
  }

  return ok({ valid: true, message: "Invitation token is valid" });
}
