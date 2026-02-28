import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";
import { ok, err, unauthorized } from "@/lib/api-response";

const TEST_EMAIL_DEFAULT = "harwin.galvis@gmail.com";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error || !user) return unauthorized(error ?? undefined);

  let to = TEST_EMAIL_DEFAULT;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.to && typeof body.to === "string" && body.to.includes("@")) {
      to = body.to.trim();
    }
  } catch {
    // keep default
  }

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
