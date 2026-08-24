// NOTE: no "server-only" import (see dispatch.ts for why) — this file is
// only imported from server-side code, and the package itself crashes when
// loaded outside Next.js's build pipeline (e.g. standalone tsx scripts).
/**
 * Outbound WhatsApp via Fonnte (fonnte.com) — chosen over Wablas/Starsender
 * for SSO because it has a pay-as-you-go plan with no monthly minimum, a
 * simple single-token REST API (no Meta Business verification/WABA
 * approval needed, unlike the official WhatsApp Cloud API), and connects by
 * scanning a QR code with a normal WA number in a few minutes.
 *
 * Same no-op-until-configured pattern as email.ts: safe to deploy before
 * FONNTE_TOKEN exists.
 */
export interface SendWhatsAppInput {
  /** International format without "+", e.g. "6281234567890". */
  to: string;
  message: string;
}

function isConfigured() {
  return process.env.NOTIFICATIONS_OUTBOUND_ENABLED === "true" && !!process.env.FONNTE_TOKEN;
}

/**
 * Same Fonnte call as sendWhatsApp, but for the self-service "Test
 * Notifikasi" button (Settings > Profil Saya) — returns WHY it failed in
 * plain language instead of a bare boolean, so a non-technical admin can
 * diagnose a broken WA setup (missing env var vs disconnected Fonnte
 * device vs bad token) without ever needing to read a server log.
 */
export async function testWhatsAppConnection(input: SendWhatsAppInput): Promise<{ ok: boolean; reason: string }> {
  if (process.env.NOTIFICATIONS_OUTBOUND_ENABLED !== "true") {
    return {
      ok: false,
      reason: 'Notifikasi outbound belum diaktifkan — env var NOTIFICATIONS_OUTBOUND_ENABLED di Vercel belum "true".',
    };
  }
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
      body: new URLSearchParams({ target: input.to, message: input.message }),
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

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`[notifications/whatsapp] SKIPPED (not configured) -> ${input.to}: ${input.message.slice(0, 60)}`);
    return false;
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.FONNTE_TOKEN as string,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: input.to, message: input.message }),
    });
    if (!res.ok) {
      console.error(`[notifications/whatsapp] FAILED -> ${input.to}: HTTP ${res.status}`);
      return false;
    }
    const body = await res.json().catch(() => null);
    if (body && body.status === false) {
      console.error(`[notifications/whatsapp] FAILED -> ${input.to}:`, body.reason || body);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notifications/whatsapp] FAILED -> ${input.to}:`, err);
    return false;
  }
}
