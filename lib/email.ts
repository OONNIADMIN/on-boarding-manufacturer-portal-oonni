import nodemailer from "nodemailer";

const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
const useSecure = smtpPort === 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: smtpPort,
  secure: useSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
});

const FROM = `"${process.env.SMTP_FROM_NAME ?? "OONNI Platform"}" <${process.env.SMTP_FROM_EMAIL ?? "noreply@oonni.com"}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Envía un correo de prueba para validar la configuración SMTP. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string; messageId?: string; verified?: boolean }> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OONNI – Test de correo</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1a1a2e;">Correo de prueba – OONNI</h2>
  <p>Si recibes este correo, la configuración SMTP está correcta.</p>
  <p><strong>Servidor:</strong> ${process.env.SMTP_HOST ?? "—"}<br>
  <strong>Puerto:</strong> ${process.env.SMTP_PORT ?? "—"}<br>
  <strong>Remitente:</strong> ${process.env.SMTP_FROM_EMAIL ?? "—"}</p>
  <p style="color:#666;font-size:14px;">Enviado el ${new Date().toLocaleString()}.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#999;font-size:12px;">OONNI Platform – Test SMTP</p>
</body>
</html>`;

  try {
    // Verificar conexión y credenciales SMTP antes de enviar
    await transporter.verify();
  } catch (verifyErr) {
    const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
    const code = verifyErr && typeof verifyErr === "object" && "code" in verifyErr ? String((verifyErr as { code?: string }).code) : "";
    console.error("SMTP verify failed:", verifyErr);

    let userMessage = `Conexión SMTP fallida: ${msg}`;
    if (msg.includes("Maximum credits exceeded") || msg.includes("credits exceeded") || msg.includes("quota")) {
      userMessage = "Límite de envíos del proveedor alcanzado. Revisa el plan/créditos en SendGrid (o Brevo) y vuelve a intentar más tarde.";
    } else if (code === "EAUTH" && process.env.SMTP_HOST?.includes("sendgrid")) {
      userMessage = "Autenticación SendGrid fallida. Comprueba: 1) API Key con permiso 'Mail Send', 2) IP en la Allow List si usas restricción por IP, 3) Remitente (From) verificado en Sender Authentication.";
    } else if (code === "ETIMEDOUT" || msg.includes("Greeting never received") || msg.includes("CONN")) {
      userMessage = "No se pudo conectar al servidor SMTP (timeout). Prueba: 1) Usar puerto 465 en lugar de 587 (SMTP_PORT=465 en .env.local), 2) Comprobar firewall/antivirus que no bloquee el puerto de salida, 3) Probar desde otra red (ej. móvil en lugar de corporativa).";
    }

    return { ok: false, error: userMessage, verified: false };
  }

  try {
    const result = await transporter.sendMail({
      from: FROM,
      to,
      subject: "OONNI – Test de configuración SMTP",
      html,
    });
    console.log("Test email sent:", { messageId: result.messageId, to, response: result.response });
    return { ok: true, messageId: result.messageId ?? undefined, verified: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Test email failed:", err);
    return { ok: false, error: message, verified: true };
  }
}

export async function sendManufacturerInvitation(
  email: string,
  name: string,
  invitationToken: string
): Promise<boolean> {
  const link = `${APP_URL}/set-password?token=${invitationToken}`;
  const hours = process.env.INVITATION_TOKEN_EXPIRE_HOURS ?? "72";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to OONNI – Set Your Password</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;background-color:#e8e8e3;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#e8e8e3;">
    <tr>
      <td style="padding:32px 16px;" align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,51,51,0.08);">
          <tr>
            <td style="background-color:#003333;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.02em;color:#fff;">OONNI</h1>
              <p style="margin:8px 0 0 0;font-size:13px;color:rgba(255,255,255,0.9);letter-spacing:0.03em;">Source globally – Buy Locally</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 36px;">
              <h2 style="margin:0 0 24px 0;font-size:22px;font-weight:600;color:#003333;">Welcome to OONNI</h2>
              <p style="margin:0 0 16px 0;font-size:16px;color:#333;">Hello <strong>${escapeHtml(name)}</strong>,</p>
              <p style="margin:0 0 20px 0;font-size:16px;color:#333;">
                You have been invited to join <strong>OONNI</strong> as a manufacturer — the B2B marketplace for the hospitality and foodservice industry. We're excited to have you on board.
              </p>
              <p style="margin:0 0 28px 0;font-size:16px;color:#333;">
                To complete your registration and set your password, click the button below:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 32px 0;">
                    <a href="${link}" style="display:inline-block;background-color:#5a9e8e;color:#fff;padding:14px 36px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">Set Your Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:</p>
              <p style="margin:0 0 24px 0;word-break:break-all;color:#003333;background-color:#f5f5f0;padding:12px 14px;border-radius:6px;font-size:12px;border-left:3px solid #5a9e8e;">${link}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f0;border-radius:8px;border-left:4px solid #5a9e8e;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#134444;font-size:14px;"><strong>Important:</strong> This invitation link expires in <strong>${hours} hours</strong>. Use it before then to activate your account.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#003333;padding:24px 36px;text-align:center;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.85);">If you did not expect this invitation, you can safely ignore this email.</p>
              <p style="margin:16px 0 0 0;font-size:12px;"><a href="https://oonni.com" style="color:#5a9e8e;text-decoration:none;">oonni.com</a></p>
              <p style="margin:12px 0 0 0;font-size:11px;color:rgba(255,255,255,0.6);">© 2025 OONNI. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: "Welcome to OONNI – Set Your Password",
      html,
    });
    return true;
  } catch (err) {
    console.error("Failed to send invitation email:", err);
    return false;
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

export async function sendCatalogUploadNotification(opts: {
  adminEmails: string[];
  manufacturerName: string;
  userName: string;
  userEmail: string;
  catalogName: string;
  fileType: string;
  fileSize: string;
  catalogId?: number;
  imagesUploaded?: number;
  imagesFailed?: number;
}): Promise<boolean> {
  if (!opts.adminEmails.length) return true;

  const date = new Date().toLocaleString("en-US");
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Catalog Upload</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1a1a2e;">New Catalog Upload</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:8px;color:#555;">Manufacturer</td><td style="padding:8px;font-weight:bold;">${opts.manufacturerName}</td></tr>
    <tr style="background:#f9f9f9;"><td style="padding:8px;color:#555;">Uploaded by</td><td style="padding:8px;">${opts.userName} (${opts.userEmail})</td></tr>
    <tr><td style="padding:8px;color:#555;">Catalog</td><td style="padding:8px;">${opts.catalogName}</td></tr>
    <tr style="background:#f9f9f9;"><td style="padding:8px;color:#555;">File type</td><td style="padding:8px;">${opts.fileType}</td></tr>
    <tr><td style="padding:8px;color:#555;">File size</td><td style="padding:8px;">${opts.fileSize}</td></tr>
    <tr style="background:#f9f9f9;"><td style="padding:8px;color:#555;">Date</td><td style="padding:8px;">${date}</td></tr>
    ${opts.imagesUploaded !== undefined ? `<tr><td style="padding:8px;color:#555;">Images uploaded</td><td style="padding:8px;">${opts.imagesUploaded} (${opts.imagesFailed ?? 0} failed)</td></tr>` : ""}
  </table>
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
    View Dashboard
  </a>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: opts.adminEmails,
      subject: `New Catalog Upload: ${opts.catalogName} by ${opts.manufacturerName}`,
      html,
    });
    return true;
  } catch (err) {
    console.error("Failed to send catalog notification:", err);
    return false;
  }
}
