import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";
import { ok, err, unauthorized } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const to = user.email;

  const result = await sendTestEmail(to);
  if (!result.ok) {
    return err(result.error ?? "Failed to send test email", 500);
  }

  return ok({
    message: "Test email sent successfully",
    to,
    messageId: result.messageId ?? null,
    hint: "Si no llega el correo, revisa en Brevo: Remitente verificado, dominio autenticado (DKIM) y créditos. Estadísticas → Emails transaccionales.",
  });
}
