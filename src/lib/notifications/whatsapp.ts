/** Provider selection preserves existing setup; official Cloud API is preferred.
 * No provider guarantees delivery or exemption from platform enforcement.
 */
import type { SendWhatsAppInput, WhatsAppSendResult } from "./whatsapp-types";
import { sendWhatsAppCloud, testWhatsAppConnectionCloud } from "./whatsapp-cloud";
import { sendWhatsAppFonnte, testWhatsAppConnectionFonnte } from "./whatsapp-fonnte";
import { notificationConfig } from "./config";

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
  const config = notificationConfig();
  if (!config.appUrlReady) return { ok: false, reason: "Alamat aplikasi HTTPS belum dikonfigurasi. Hubungi administrator." };
  // Partial Cloud setup must not silently route a business message to another provider.
  return config.cloudStarted ? testWhatsAppConnectionCloud(input) : testWhatsAppConnectionFonnte(input);
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<boolean> {
  if (!outboundEnabled()) {
    return false;
  }
  const config = notificationConfig();
  if (!config.whatsappReady) return false;
  return config.cloudStarted ? sendWhatsAppCloud(input) : sendWhatsAppFonnte(input);
}
