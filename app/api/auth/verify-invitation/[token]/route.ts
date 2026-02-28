import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isInvitationTokenExpired } from "@/lib/auth";
import { ok } from "@/lib/api-response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const user = await prisma.user.findUnique({ where: { invitation_token: token } });

  if (!user) return ok({ valid: false, message: "Invalid invitation token" });

  if (isInvitationTokenExpired(user.invitation_token_expires_at)) {
    return ok({ valid: false, expired: true, email: user.email, name: user.name, message: "Invitation token has expired" });
  }

  if (user.is_active) {
    return ok({ valid: false, email: user.email, name: user.name, message: "This invitation has already been used" });
  }

  return ok({ valid: true, email: user.email, name: user.name, message: "Invitation token is valid" });
}
