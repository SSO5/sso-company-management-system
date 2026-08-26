/**
 * Outbound WhatsApp — provider router. Two providers exist:
 *  - whatsapp-cloud.ts: Meta's official WhatsApp Business Cloud API. Used
 *    automatically whenever WHATSAPP_CLOUD_API_TOKEN and
 *    WHATSAPP_CLOUD_API_PHONE_NUMBER_ID are both set — the sanctioned
 *    method, so the sending number does not get suspended the way an
 *    unofficial gateway eventually does.
 *  - whatsapp-fonnte.ts: the older unofficial WA Web gateway, kept as a
 *    fallback for whoever hasn't finished Cloud API setup yet.
 * Cloud API wins whenever both are configured (see .env.example for setup
 * of either). Neither configured, or NOTIFICATIONS_OUTBOUND_ENABLED isn't
 * "true" -> every call below is a safe no-op, same as before.
 */
import type { SendWhatsAppInput, WhatsAppSendResult } from "./whatsapp-types";
import { isCloudApiConfigured, sendWhatsAppCloud, testWhatsAppConnectionCloud } from "./whatsapp-cloud";
import { sendWhatsAppFonnte, testWhatsAppConnectionFonnte } from "./whatsapp-fonnte";

export type { SendWhatsAppInput };

function outboundEnabled() {
  return process.env.NOTIFICATIONS_OUTBOUND_ENABLED === "true";
}

/**
 * For the self-service "Test Notifikasi" button (Settings > Profil Saya) —
 * returns WHY it failed in plain language instead of a bare boolean, so a
 * non-technical admin can self-diagnose without reading a server log.
 */
export async function testWhatsAppConnection(input: SendWhatsAppInput): Promise<WhatsAppSendResult> {
  if (!outboundEnabled()) {
    return {
      ok: false,
      reason: 'Notifikasi outbound belum diaktifkan — env var NOTIFICATIONS_OUTBOUND_ENABLED di Vercel belum "true".',
    };
  }
  return isCloudApiConfigured() ? testWhatsAppConnectionCloud(input) : testWhatsAppConnectionFonnte(input);
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<boolean> {
  if (!outboundEnabled()) {
    console.log(`[notifications/whatsapp] SKIPPED (outbound disabled) -> ${input.to}`);
    return false;
  }
  return isCloudApiConfigured() ? sendWhatsAppCloud(input) : sendWhatsAppFonnte(input);
}
