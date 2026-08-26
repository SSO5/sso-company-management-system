// NOTE: no "server-only" import (see dispatch.ts for why) — this file is
// only imported from server-side code, and the package itself crashes when
// loaded outside Next.js's build pipeline (e.g. standalone tsx scripts).
/**
 * Outbound WhatsApp via Fonnte (fonnte.com) — an unofficial WA Web
 * automation gateway (connects by scanning a QR code with a real WA
 * number, no Meta Business verification needed). Kept only as a fallback
 * for whoever hasn't finished setting up whatsapp-cloud.ts yet: this method
 * is against WhatsApp's own ToS, and numbers used this way get suspended by
 * WhatsApp itself over time (see whatsapp.ts for the provider router, which
 * prefers Cloud API whenever it's configured).
 */
import type { SendWhatsAppInput, WhatsAppSendResult } from "./whatsapp-types";

function isConfigured() {
  return !!process.env.FONNTE_TOKEN;
}

function buildMessage(input: SendWhatsAppInput): string {
  const linkLine = input.link ? `\n\n${input.link}` : "";
  return `Halo ${input.recipientName},\n\n*${input.title}*\n${input.message}${linkLine}\n\n— SSO Connect`;
}

/**
 * Same Fonnte call as sendWhatsAppFonnte, but for the self-service "Test
 * Notifikasi" button (Settings > Profil Saya) — returns WHY it failed in
 * plain language instead of a bare boolean, so a non-technical admin can
 * diagnose a broken WA setup (missing env var vs disconnected Fonnte
 * device vs bad token) without ever needing to read a server log.
 */
export async function testWhatsAppConnectionFonnte(input: SendWhatsAppInput): Promise<WhatsAppSendResult> {
  if (!process.env.FONNTE_TOKEN) {
    return { ok: false, reason: "Token Fonnte belum diisi — env var FONNTE_TOKEN kosong di Vercel." };
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: input.to, message: buildMessage(input) }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        reason: `Fonnte menolak request (HTTP ${res.status})${body?.reason ? ` — "${body.reason}"` : ""}. Cek apakah token Fonnte benar.`,
      };
    }
    if (body && body.status === false) {
      return {
        ok: false,
        reason: `Fonnte menolak pesan — "${body.reason || "alasan tidak diketahui"}". Kemungkinan besar device Fonnte terputus (perlu scan ulang QR di fonnte.com) atau token salah.`,
      };
    }
    return { ok: true, reason: "Pesan berhasil dikirim ke Fonnte — cek WhatsApp Anda dalam beberapa detik." };
  } catch (err) {
    return { ok: false, reason: `Gagal menghubungi Fonnte: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function sendWhatsAppFonnte(input: SendWhatsAppInput): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`[notifications/whatsapp-fonnte] SKIPPED (not configured) -> ${input.to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.FONNTE_TOKEN as string,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: input.to, message: buildMessage(input) }),
    });
    if (!res.ok) {
      console.error(`[notifications/whatsapp-fonnte] FAILED -> ${input.to}: HTTP ${res.status}`);
      return false;
    }
    const body = await res.json().catch(() => null);
    if (body && body.status === false) {
      console.error(`[notifications/whatsapp-fonnte] FAILED -> ${input.to}:`, body.reason || body);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notifications/whatsapp-fonnte] FAILED -> ${input.to}:`, err);
    return false;
  }
}
