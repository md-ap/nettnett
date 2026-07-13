// Transactional email via Resend (REST API — no SDK dependency).
// Until the real domain is verified, EMAIL_FROM uses onboarding@resend.dev.
// NOTE: with the resend.dev sender, Resend only delivers to the account
// owner's email — other recipients work once the domain is verified.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "NettNett Radio <onboarding@resend.dev>";

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn(`RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error("Resend error:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend request failed:", error);
    return false;
  }
}

// ─── Brand template ─────────────────────────────────────────────
// Dark NettNett look: black background, Helvetica, "nnr" wordmark.
// Table-based with inline styles for email-client compatibility.

interface TemplateArgs {
  heading: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}

function emailLayout({ heading, bodyHtml, ctaText, ctaUrl }: TemplateArgs): string {
  const cta =
    ctaText && ctaUrl
      ? `<tr>
          <td align="center" style="padding: 28px 0 8px 0;">
            <a href="${ctaUrl}"
               style="display: inline-block; background-color: #ffffff; color: #000000;
                      font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: bold;
                      text-decoration: none; padding: 12px 32px; border-radius: 4px;">
              ${ctaText}
            </a>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #000000;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width: 480px; background-color: #0d0d0d; border: 1px solid #262626; border-radius: 8px;">
          <tr>
            <td align="center" style="padding: 36px 32px 8px 32px;">
              <span style="font-family: Helvetica, Arial, sans-serif; font-size: 34px; font-weight: bold;
                           color: #ffffff; letter-spacing: -1px;">nnr</span>
              <div style="font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #666666;
                          text-transform: uppercase; letter-spacing: 3px; padding-top: 4px;">
                NettNett Radio
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 0 32px;">
              <h1 style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 20px;
                         font-weight: bold; color: #ffffff;">
                ${heading}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 14px 32px 0 32px; font-family: Helvetica, Arial, sans-serif;
                       font-size: 14px; line-height: 1.6; color: #b3b3b3;">
              ${bodyHtml}
            </td>
          </tr>
          ${cta}
          <tr>
            <td style="padding: 32px;">
              <div style="border-top: 1px solid #262626; padding-top: 16px;
                          font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #555555;">
                NettNett Radio — plataforma de radio y archivo.
                <br />Si no esperabas este correo, puedes ignorarlo.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Emails ─────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  appUrl: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Bienvenido a NettNett Radio 📻",
    html: emailLayout({
      heading: `Hola ${firstName}, bienvenido a NettNett`,
      bodyHtml: `
        <p style="margin: 0 0 12px 0;">Tu cuenta fue creada con éxito.</p>
        <p style="margin: 0 0 12px 0;">
          Desde tu panel puedes subir audio y materiales al archivo,
          publicarlos opcionalmente en Internet Archive, y escuchar la radio en vivo.
        </p>`,
      ctaText: "Ir a mi panel",
      ctaUrl: `${appUrl}/dashboard`,
    }),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetUrl: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Restablece tu contraseña — NettNett Radio",
    html: emailLayout({
      heading: `Hola ${firstName}`,
      bodyHtml: `
        <p style="margin: 0 0 12px 0;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        </p>
        <p style="margin: 0 0 12px 0;">
          El enlace es válido por <strong style="color:#ffffff;">1 hora</strong>.
          Si tú no lo solicitaste, ignora este correo — tu contraseña no cambia.
        </p>`,
      ctaText: "Restablecer contraseña",
      ctaUrl: resetUrl,
    }),
  });
}
