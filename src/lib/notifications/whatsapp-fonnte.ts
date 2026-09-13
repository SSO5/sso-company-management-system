/** Legacy provider retained for existing installations. Prefer the official Cloud API. */
import type { SendWhatsAppInput, WhatsAppSendResult } from "./whatsapp-types";
import { notificationLink } from "./config";
export async function testWhatsAppConnectionFonnte(input: SendWhatsAppInput): Promise<WhatsAppSendResult> {
  if (!process.env.FONNTE_TOKEN) return { ok: false, reason: "Penyedia WhatsApp belum dikonfigurasi. Hubungi administrator." };
  const link = notificationLink(input.link);
  if (!link) return { ok: false, reason: "Alamat aplikasi HTTPS belum valid." };
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: process.env.FONNTE_TOKEN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target: input.to, message: `Halo ${input.recipientName},\n\n*${input.title}*\n${input.message}\n\n${link}\n\n— SSO Connect` }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.status !== true) return { ok: false, reason: `Fonnte belum menerima permintaan (HTTP ${res.status}). Periksa status perangkat dan token pada penyedia.` };
    return { ok: true, reason: "Permintaan diterima Fonnte. Penerimaan di ponsel belum terkonfirmasi; periksa nomor tujuan." };
  } catch {
    return { ok: false, reason: "Fonnte tidak dapat dihubungi atau respons tidak valid. Tidak dilakukan pengiriman ulang otomatis." };
  }
}
export async function sendWhatsAppFonnte(input: SendWhatsAppInput): Promise<boolean> {
  return (await testWhatsAppConnectionFonnte(input)).ok;
}
