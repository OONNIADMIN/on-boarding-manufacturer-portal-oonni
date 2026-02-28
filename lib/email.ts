/**
 * Email service – SendGrid Web API v3 (HTTPS/443).
 * Vercel bloquea SMTP (25/465/587); HTTPS sí está permitido.
 *
 * Variables de entorno:
 *   SENDGRID_API_KEY   – API Key con scope "Mail Send"
 *   SMTP_FROM_EMAIL    – Remitente verificado en SendGrid Sender Authentication
 *   SMTP_FROM_NAME     – Nombre visible del remitente
 *   NEXT_PUBLIC_APP_URL – URL base de la app (ej: https://tu-app.vercel.app)
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const FROM_EMAIL      = process.env.SMTP_FROM_EMAIL   ?? "noreply@oonni.com";
const FROM_NAME       = process.env.SMTP_FROM_NAME    ?? "OONNI Platform";
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

// ─────────────────────────────────────────────
// Núcleo: envío vía SendGrid HTTP API
// ─────────────────────────────────────────────
async function sendViaAPI(
  to: string | string[],
  subject: string,
  html: string
): Promise<SendResult> {
  if (!SENDGRID_API_KEY) {
    console.error("[email] SENDGRID_API_KEY no configurada");
    return { ok: false, error: "SENDGRID_API_KEY no configurada. Añádela en las variables de entorno de Vercel." };
  }

  const toList = Array.isArray(to) ? to : [to];

  const body = {
    personalizations: [{ to: toList.map((email) => ({ email })) }],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    content: [{ type: "text/html", value: html }],
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    console.error(`[email] SendGrid ${res.status}:`, errText);
    return { ok: false, error: `SendGrid ${res.status}: ${errText}` };
  }

  const messageId = res.headers.get("x-message-id") ?? undefined;
  console.log("[email] Sent ok →", { to, subject, messageId });
  return { ok: true, messageId };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

// ─────────────────────────────────────────────
// Plantillas
// ─────────────────────────────────────────────
function oonniHeader(): string {
  return `
    <tr>
      <td style="background-color:#003333;padding:32px 24px;text-align:center;">
        <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.02em;color:#fff;">OONNI</h1>
        <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.9);letter-spacing:0.03em;">Source globally – Buy Locally</p>
      </td>
    </tr>`;
}

function oonniFooter(): string {
  return `
    <tr>
      <td style="background-color:#003333;padding:24px 36px;text-align:center;">
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.85);">If you did not expect this email, you can safely ignore it.</p>
        <p style="margin:16px 0 0;font-size:12px;"><a href="https://oonni.com" style="color:#5a9e8e;text-decoration:none;">oonni.com</a></p>
        <p style="margin:12px 0 0;font-size:11px;color:rgba(255,255,255,0.6);">© 2025 OONNI. All rights reserved.</p>
      </td>
    </tr>`;
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;background:#e8e8e3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8e8e3;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,51,51,0.08);">
        ${content}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// Funciones exportadas
// ─────────────────────────────────────────────

/** Correo de prueba para validar la configuración de SendGrid. */
export async function sendTestEmail(to: string): Promise<SendResult> {
  const html = emailWrapper(`
    ${oonniHeader()}
    <tr><td style="padding:36px;">
      <h2 style="color:#003333;margin:0 0 16px;">Email Configuration Test</h2>
      <p style="color:#333;font-size:15px;">If you received this email, the SendGrid configuration is working correctly.</p>
      <table style="margin:20px 0;width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;color:#555;font-size:14px;">Provider</td><td style="padding:8px;font-weight:600;">SendGrid Web API (HTTPS)</td></tr>
        <tr style="background:#f5f5f0;"><td style="padding:8px;color:#555;font-size:14px;">From</td><td style="padding:8px;">${escapeHtml(FROM_EMAIL)}</td></tr>
        <tr><td style="padding:8px;color:#555;font-size:14px;">Sent at</td><td style="padding:8px;">${new Date().toLocaleString()}</td></tr>
      </table>
    </td></tr>
    ${oonniFooter()}`);

  return sendViaAPI(to, "OONNI – Email Configuration Test", html);
}

/**
 * Envía el correo de invitación al manufacturer.
 * IMPORTANTE: invitationToken es el mismo valor guardado en la DB.
 * Se awaita de forma síncrona para garantizar que el mismo token llegue al correo.
 */
export async function sendManufacturerInvitation(
  email: string,
  name: string,
  invitationToken: string
): Promise<boolean> {
  // El token que se embebe en el link es el mismo que está guardado en DB.
  const link = `${APP_URL}/set-password?token=${invitationToken}`;
  const hours = process.env.INVITATION_TOKEN_EXPIRE_HOURS ?? "72";

  console.log("[email] sendManufacturerInvitation", {
    to: email,
    tokenPrefix: invitationToken.slice(0, 8) + "...",
    link,
  });

  const html = emailWrapper(`
    ${oonniHeader()}
    <tr><td style="padding:40px 36px;">
      <h2 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#003333;">Welcome to OONNI</h2>
      <p style="margin:0 0 16px;font-size:16px;color:#333;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:16px;color:#333;">
        You have been invited to join <strong>OONNI</strong> as a manufacturer — the B2B marketplace for the hospitality and foodservice industry.
      </p>
      <p style="margin:0 0 28px;font-size:16px;color:#333;">Click the button below to set your password and activate your account:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr><td align="center" style="padding:8px 0 32px;">
          <a href="${link}" style="display:inline-block;background:#5a9e8e;color:#fff;padding:14px 36px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">Set Your Password</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;word-break:break-all;color:#003333;background:#f5f5f0;padding:12px 14px;border-radius:6px;font-size:12px;border-left:3px solid #5a9e8e;">${link}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f0;border-radius:8px;border-left:4px solid #5a9e8e;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0;color:#134444;font-size:14px;"><strong>Important:</strong> This link expires in <strong>${hours} hours</strong>. Use it before then to activate your account.</p>
        </td></tr>
      </table>
    </td></tr>
    ${oonniFooter()}`);

  const result = await sendViaAPI(email, "Welcome to OONNI – Set Your Password", html);
  if (!result.ok) console.error("[email] sendManufacturerInvitation failed:", result.error);
  return result.ok;
}

/** Notificación a admins cuando se sube un catálogo. */
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
  const html = emailWrapper(`
    ${oonniHeader()}
    <tr><td style="padding:36px;">
      <h2 style="color:#003333;margin:0 0 20px;">New Catalog Upload</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;color:#555;font-size:14px;">Manufacturer</td><td style="padding:8px;font-weight:600;">${escapeHtml(opts.manufacturerName)}</td></tr>
        <tr style="background:#f5f5f0;"><td style="padding:8px;color:#555;font-size:14px;">Uploaded by</td><td style="padding:8px;">${escapeHtml(opts.userName)} (${escapeHtml(opts.userEmail)})</td></tr>
        <tr><td style="padding:8px;color:#555;font-size:14px;">Catalog</td><td style="padding:8px;">${escapeHtml(opts.catalogName)}</td></tr>
        <tr style="background:#f5f5f0;"><td style="padding:8px;color:#555;font-size:14px;">File type</td><td style="padding:8px;">${escapeHtml(opts.fileType)}</td></tr>
        <tr><td style="padding:8px;color:#555;font-size:14px;">File size</td><td style="padding:8px;">${escapeHtml(opts.fileSize)}</td></tr>
        <tr style="background:#f5f5f0;"><td style="padding:8px;color:#555;font-size:14px;">Date</td><td style="padding:8px;">${date}</td></tr>
        ${opts.imagesUploaded !== undefined
          ? `<tr><td style="padding:8px;color:#555;font-size:14px;">Images</td><td style="padding:8px;">${opts.imagesUploaded} uploaded, ${opts.imagesFailed ?? 0} failed</td></tr>`
          : ""}
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
        <tr><td align="center">
          <a href="${APP_URL}/dashboard" style="display:inline-block;background:#5a9e8e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">View Dashboard</a>
        </td></tr>
      </table>
    </td></tr>
    ${oonniFooter()}`);

  const result = await sendViaAPI(
    opts.adminEmails,
    `New Catalog Upload: ${opts.catalogName} by ${opts.manufacturerName}`,
    html
  );
  if (!result.ok) console.error("[email] sendCatalogUploadNotification failed:", result.error);
  return result.ok;
}
