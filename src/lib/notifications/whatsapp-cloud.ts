/**
 * Outbound WhatsApp via Meta's official WhatsApp Business Cloud API
 * (developers.facebook.com/docs/whatsapp/cloud-api) — the sanctioned
 * alternative to whatsapp-fonnte.ts. whatsapp.ts (the provider router)
 * prefers this one automatically whenever WHATSAPP_CLOUD_API_TOKEN and
 * WHATSAPP_CLOUD_API_PHONE_NUMBER_ID are both set, since this is the method
 * WhatsApp itself sanctions — a number used this way does not get
 * suspended for "automation" the way an unofficial gateway eventually does.
 * See .env.example for the full setup walkthrough.
 *
 * The trade-off that shapes this whole file: Meta only allows sending
 * FREEFORM text when the recipient has messaged this business number
 * within the last 24 hours (a "customer service window"). Every
 * notification SSO Connect sends is business-initiated — nobody texts the
 * bot first — so every send here goes out as a pre-approved message
 * TEMPLATE instead, with the notification's name/title/message/link filled
 * into the template's four placeholders. The template itself has to be
 * created once in Meta's WhatsApp Manager (see .env.example) before this
 * will work; this file has no way to create or approve it via API.
 */
import type { SendWhatsAppInput, WhatsAppSendResult } from "./whatsapp-types";

function apiVersion() {
  return process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0";
}

function templateName() {
  return process.env.WHATSAPP_CLOUD_API_TEMPLATE_NAME || "sso_notifikasi";
}

function templateLang() {
  return process.env.WHATSAPP_CLOUD_API_TEMPLATE_LANG || "id";
}

export function isCloudApiConfigured() {
  return !!(process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID);
}

/**
 * Meta rejects template parameter values containing newlines/tabs or long
 * runs of spaces — dispatch.ts's payload.message is often multi-line, so
 * flatten it to one line before it ever reaches the API.
 */
function sanitizeParam(value: string): string {
  return value.replace(/[\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim();
}

function buildTemplateBody(input: SendWhatsAppInput) {
  // Meta also rejects an empty parameter value, so the link slot always
  // gets something — the app's own base URL when no specific deep link
  // was given, rather than an empty string.
  const appUrl = process.env.APP_BASE_URL || "";
  const link = input.link ? `${appUrl}${input.link}` : appUrl || "https://sso-connect";
  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: templateName(),
      language: { code: templateLang() },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: sanitizeParam(input.recipientName) },
            { type: "text", text: sanitizeParam(input.title) },
            { type: "text", text: sanitizeParam(input.message) },
            { type: "text", text: sanitizeParam(link) },
          ],
        },
      ],
    },
  };
}

async function send(input: SendWhatsAppInput): Promise<{ ok: boolean; status: number; body: { error?: { message?: string } } | null }> {
  const url = `https://graph.facebook.com/${apiVersion()}/${process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTemplateBody(input)),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Same Cloud API call as sendWhatsAppCloud, but for the self-service "Test
 * Notifikasi" button (Settings > Profil Saya) — returns WHY it failed in
 * plain language (bad/expired token, wrong Phone Number ID, template not
 * yet approved) instead of a bare boolean.
 */
export async function testWhatsAppConnectionCloud(input: SendWhatsAppInput): Promise<WhatsAppSendResult> {
  if (!process.env.WHATSAPP_CLOUD_API_TOKEN) {
    return { ok: false, reason: "Token WhatsApp Cloud API belum diisi — env var WHATSAPP_CLOUD_API_TOKEN kosong di Vercel." };
  }
  if (!process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID) {
    return { ok: false, reason: "Phone Number ID belum diisi — env var WHATSAPP_CLOUD_API_PHONE_NUMBER_ID kosong di Vercel." };
  }
  try {
    const { ok, status, body } = await send(input);
    if (!ok) {
      const metaMsg = body?.error?.message || "alasan tidak diketahui";
      const hint =
        status === 401
          ? " Kemungkinan token sudah expired — generate token permanen baru lewat System User di Meta Business Settings."
          : status === 400
          ? ` Kemungkinan template "${templateName()}" belum ada / belum di-approve Meta — cek WhatsApp Manager > Message Templates.`
          : "";
      return { ok: false, reason: `WhatsApp Cloud API menolak request (HTTP ${status}) — "${metaMsg}".${hint}` };
    }
    return { ok: true, reason: "Pesan berhasil dikirim lewat WhatsApp Cloud API — cek WhatsApp Anda dalam beberapa detik." };
  } catch (err) {
    return { ok: false, reason: `Gagal menghubungi WhatsApp Cloud API: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function sendWhatsAppCloud(input: SendWhatsAppInput): Promise<boolean> {
  if (!isCloudApiConfigured()) {
    console.log(`[notifications/whatsapp-cloud] SKIPPED (not configured) -> ${input.to}`);
    return false;
  }
  try {
    const { ok, status, body } = await send(input);
    if (!ok) {
      console.error(`[notifications/whatsapp-cloud] FAILED -> ${input.to}: HTTP ${status}`, body?.error || body);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notifications/whatsapp-cloud] FAILED -> ${input.to}:`, err);
    return false;
  }
}
