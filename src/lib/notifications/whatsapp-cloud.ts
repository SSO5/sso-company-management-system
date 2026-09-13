/** Official Meta Cloud API. Business-initiated notifications use an approved template.
 * API acceptance is separate from delivery; no provider guarantees an account cannot be restricted.
 */
import type { SendWhatsAppInput, WhatsAppSendResult } from "./whatsapp-types";
import { notificationLink } from "./config";

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
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim() || "—";
}

function buildTemplateBody(input: SendWhatsAppInput) {
  // Meta also rejects an empty parameter value, so the link slot always
  // gets something — the app's own base URL when no specific deep link
  // was given, rather than an empty string.
  const link = notificationLink(input.link);
  if (!link) throw new Error("Alamat tautan notifikasi tidak valid.");
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

async function send(input: SendWhatsAppInput): Promise<{ ok: boolean; status: number; body: { messages?: { id?: string }[]; error?: { code?: number } } | null }> {
  const url = `https://graph.facebook.com/${apiVersion()}/${process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTemplateBody(input)),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok && Boolean(body?.messages?.[0]?.id), status: res.status, body };
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
      const metaMsg = body?.error?.code ? `kode ${body.error.code}` : "respons tidak memuat ID pesan";
      const hint =
        status === 401
          ? " Kemungkinan token sudah expired — generate token permanen baru lewat System User di Meta Business Settings."
          : status === 400
          ? ` Kemungkinan template "${templateName()}" belum ada / belum di-approve Meta — cek WhatsApp Manager > Message Templates.`
          : "";
      return { ok: false, reason: `WhatsApp Cloud API menolak request (HTTP ${status}) — "${metaMsg}".${hint}` };
    }
    return { ok: true, reason: "Permintaan diterima WhatsApp Cloud API. Penerimaan di ponsel belum terkonfirmasi; periksa pesan pada nomor tujuan." };
  } catch (err) {
    return { ok: false, reason: "WhatsApp Cloud API tidak dapat dihubungi atau responsnya tidak valid. Periksa koneksi dan konfigurasi integrasi." };
  }
}

export async function sendWhatsAppCloud(input: SendWhatsAppInput): Promise<boolean> {
  if (!isCloudApiConfigured()) {
    return false;
  }
  try {
    const { ok, status, body } = await send(input);
    if (!ok) {
      console.error("[notifications/whatsapp-cloud] provider request failed", { status, code: body?.error?.code });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifications/whatsapp-cloud] network or response failure");
    return false;
  }
}
