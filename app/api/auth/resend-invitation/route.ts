import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateInvitationToken, getInvitationTokenExpiry } from "@/lib/auth";
import { sendManufacturerInvitation } from "@/lib/email";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  try {
    const body = await req.json();
    const userId = body.user_id != null ? Number(body.user_id) : null;

    if (userId == null || !Number.isInteger(userId)) {
      return err("user_id is required and must be an integer");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, manufacturer: true },
    });

    if (!user) return notFound("User not found");
    if (user.role.name !== "manufacturer") {
      return err("Only manufacturer users can have their invitation resent", 400);
    }

    const token = generateInvitationToken();
    const expiresAt = getInvitationTokenExpiry();

    await prisma.user.update({
      where: { id: userId },
      data: {
        invitation_token: token,
        invitation_token_expires_at: expiresAt,
      },
    });

    // Awaitar garantiza que el token en el correo == token actualizado en DB.
    const emailSent = await sendManufacturerInvitation(user.email, user.name, token);
    if (!emailSent) console.error("[resend-invitation] Email not sent for", user.email);

    return ok({
      message: "Invitation email resent successfully",
      email: user.email,
    });
  } catch (e) {
    console.error("Resend invitation error:", e);
    return err("Failed to resend invitation", 500);
  }
}
