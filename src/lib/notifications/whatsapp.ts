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

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<boolean> {
  if (!isConfigured()) {
    // TEMPORARY DIAGNOSTIC (remove once WA/email confirmed working) — same
    // reasoning as email.ts: shows which var is missing without leaking it.
    console.log("[notifications/whatsapp] config-check", {
      enabledRaw: JSON.stringify(process.env.NOTIFICATIONS_OUTBOUND_ENABLED),
      enabledMatches: process.env.NOTIFICATIONS_OUTBOUND_ENABLED === "true",
      fonnteTokenPresent: !!process.env.FONNTE_TOKEN,
      fonnteTokenLength: process.env.FONNTE_TOKEN?.length ?? 0,
    });
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
