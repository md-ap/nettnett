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

// Welcome + email confirmation in a single message. New accounts have a
// 7-day grace period; unverified accounts are deactivated after that.
export async function sendVerificationEmail(
  to: string,
  firstName: string,
  verifyUrl: string,
  isNewAccount: boolean
): Promise<boolean> {
  return sendEmail({
    to,
    subject: isNewAccount
      ? "Confirma tu correo — Bienvenido a NettNett Radio 📻"
      : "Confirma tu correo — NettNett Radio",
    html: emailLayout({
      heading: isNewAccount
        ? `Hola ${firstName}, bienvenido a NettNett`
        : `Hola ${firstName}`,
      bodyHtml: `
        ${
          isNewAccount
            ? `<p style="margin: 0 0 12px 0;">Tu cuenta fue creada con éxito.
               Desde tu panel puedes subir audio y materiales al archivo,
               publicarlos opcionalmente en Internet Archive, y escuchar la radio en vivo.</p>`
            : ""
        }
        <p style="margin: 0 0 12px 0;">
          Confirma tu dirección de correo con el botón de abajo.
          Si no la confirmas en <strong style="color:#ffffff;">7 días</strong>,
          tu cuenta se desactivará hasta que la verifiques.
        </p>`,
      ctaText: "Confirmar mi correo",
      ctaUrl: verifyUrl,
    }),
  });
}

// Notifies the admin inbox when a plain "user" requests NettNett permissions
export async function sendAccessRequestEmail(
  adminEmail: string,
  requesterName: string,
  requesterEmail: string,
  appUrl: string
): Promise<boolean> {
  return sendEmail({
    to: adminEmail,
    subject: `Solicitud de permisos — ${requesterName}`,
    html: emailLayout({
      heading: "Nueva solicitud de permisos",
      bodyHtml: `
        <p style="margin: 0 0 12px 0;">
          <strong style="color:#ffffff;">${requesterName}</strong>
          (${requesterEmail}) solicita permisos para participar en NettNett.
        </p>
        <p style="margin: 0 0 12px 0;">
          Entra al panel de administración para asignarle un rol
          (uploader, management o admin).
        </p>`,
      ctaText: "Abrir panel de admin",
      ctaUrl: `${appUrl}/admin`,
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

// ─── Account self-service notices (/account) ────────────────────

// Security notice to the PREVIOUS address after a self-service email change.
// The old inbox can no longer password-reset (lookup is by the new email),
// so the actionable path if it wasn't them is contacting an admin.
export async function sendEmailChangedNotice(
  to: string,
  firstName: string,
  newEmail: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "El correo de tu cuenta cambió — NettNett Radio",
    html: emailLayout({
      heading: `Hola ${firstName}`,
      bodyHtml: `
        <p style="margin: 0 0 12px 0;">
          El correo de tu cuenta de NettNett Radio cambió a
          <strong style="color:#ffffff;">${newEmail}</strong>.
          Esta dirección deja de recibir los mensajes de tu cuenta.
        </p>
        <p style="margin: 0 0 12px 0;">
          Si tú no hiciste este cambio, contacta a un admin de inmediato.
        </p>`,
    }),
  });
}

// Security notice after a self-service password change.
export async function sendPasswordChangedNotice(
  to: string,
  firstName: string,
  forgotPasswordUrl: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Tu contraseña cambió — NettNett Radio",
    html: emailLayout({
      heading: `Hola ${firstName}`,
      bodyHtml: `
        <p style="margin: 0 0 12px 0;">
          La contraseña de tu cuenta de NettNett Radio acaba de cambiar.
          Si fuiste tú, no necesitas hacer nada.
        </p>
        <p style="margin: 0 0 12px 0;">
          Si no reconoces este cambio, restablece tu contraseña de inmediato.
        </p>`,
      ctaText: "Restablecer contraseña",
      ctaUrl: forgotPasswordUrl,
    }),
  });
}

// Goodbye notice after a self-service account deletion.
export async function sendAccountDeletedNotice(
  to: string,
  firstName: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Tu cuenta fue eliminada — NettNett Radio",
    html: emailLayout({
      heading: `Hasta pronto, ${firstName}`,
      bodyHtml: `
        <p style="margin: 0 0 12px 0;">
          Tu cuenta de NettNett Radio fue eliminada. Gracias por haber sido
          parte del proyecto — la radio sigue sonando para ti.
        </p>
        <p style="margin: 0 0 12px 0;">
          Si tú no solicitaste esta eliminación, contacta a un admin de inmediato.
        </p>`,
    }),
  });
}
