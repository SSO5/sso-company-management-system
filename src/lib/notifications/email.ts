import "server-only";

/**
 * Outbound email via Gmail SMTP + nodemailer (spec point #4: "koneksikan
 * aplikasi ke email dan WA user"). Deliberately isolated behind this one
 * function so the provider can be swapped (Gmail -> Google Workspace ->
 * transactional provider like Resend/SES) without touching any call site —
 * every workflow only ever calls sendEmail(), never nodemailer directly.
 *
 * Silently no-ops (logs + returns false) when SMTP_APP_PASSWORD isn't
 * configured yet, or when NOTIFICATIONS_OUTBOUND_ENABLED isn't "true" — this
 * lets the whole approval/notification system be built and deployed before
 * the Gmail App Password is actually generated, without throwing errors on
 * every submit/approve/reject in the meantime.
 *
 * nodemailer is a dependency — see package.json (run `npm install` after
 * pulling this change). Imported lazily via dynamic import() so this file
 * never crashes at build/import time even before `npm install` has run —
 * the import only executes the first time an email actually needs sending.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let cachedTransporter: unknown = null;

function isConfigured() {
  return (
    process.env.NOTIFICATIONS_OUTBOUND_ENABLED === "true" &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_APP_PASSWORD
  );
}

async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const nodemailer = await import("nodemailer");
  cachedTransporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true, // 465 = implicit TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`[notifications/email] SKIPPED (not configured) -> ${input.to}: ${input.subject}`);
    return false;
  }
  try {
    const transporter = (await getTransporter()) as {
      sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
    };
    const fromName = process.env.SMTP_FROM_NAME || "SSO Connect";
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text || input.html.replace(/<[^>]+>/g, " "),
    });
    return true;
  } catch (err) {
    console.error(`[notifications/email] FAILED -> ${input.to}:`, err);
    return false;
  }
}
