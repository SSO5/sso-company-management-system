// NOTE: no "server-only" import — same reasoning as whatsapp.ts/email.ts
// (crashes standalone tsx scripts like prisma/seed.ts; the app's own
// "use server"/"use client" boundaries already keep this out of client
// bundles).
/**
 * Outbound Telegram via the official Bot API — free, no gateway/reseller
 * needed (unlike WhatsApp, which requires either Meta Business verification
 * or a paid unofficial gateway like Fonnte). A bot token comes from
 * @BotFather in a couple of minutes; no phone number or QR scan involved.
 *
 * Same no-op-until-configured pattern as email.ts/whatsapp.ts: safe to
 * deploy before TELEGRAM_BOT_TOKEN exists.
 */
function isConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

function apiUrl(method: string) {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`[notifications/telegram] SKIPPED (not configured) -> ${chatId}: ${text.slice(0, 60)}`);
    return false;
  }
  try {
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.error(`[notifications/telegram] sendMessage FAILED -> ${chatId}: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notifications/telegram] sendMessage FAILED -> ${chatId}:`, err);
    return false;
  }
}

/** Downloads a file a user attached to a Telegram message (file_id from
 * message.document/message.photo) — the two-step dance Telegram's Bot API
 * requires: getFile resolves file_id to a temporary file_path, which is
 * then fetched from a *different* host (api.telegram.org/file/...). */
export async function getTelegramFileBuffer(fileId: string): Promise<Buffer | null> {
  if (!isConfigured()) {
    console.log(`[notifications/telegram] SKIPPED getFile (not configured) -> ${fileId}`);
    return null;
  }
  try {
    const metaRes = await fetch(apiUrl("getFile") + `?file_id=${encodeURIComponent(fileId)}`);
    if (!metaRes.ok) {
      console.error(`[notifications/telegram] getFile FAILED -> ${fileId}: HTTP ${metaRes.status}`);
      return null;
    }
    const meta = (await metaRes.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!meta.ok || !meta.result?.file_path) return null;

    const fileRes = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
    if (!fileRes.ok) {
      console.error(`[notifications/telegram] file download FAILED -> ${fileId}: HTTP ${fileRes.status}`);
      return null;
    }
    return Buffer.from(await fileRes.arrayBuffer());
  } catch (err) {
    console.error(`[notifications/telegram] getTelegramFileBuffer FAILED -> ${fileId}:`, err);
    return null;
  }
}

export async function sendTelegramDocument(
  chatId: string,
  buffer: Buffer,
  filename: string,
  caption?: string
): Promise<boolean> {
  if (!isConfigured()) {
    console.log(`[notifications/telegram] SKIPPED document (not configured) -> ${chatId}: ${filename}`);
    return false;
  }
  try {
    const form = new FormData();
    form.set("chat_id", chatId);
    if (caption) form.set("caption", caption);
    form.set("document", new Blob([buffer], { type: "application/pdf" }), filename);

    const res = await fetch(apiUrl("sendDocument"), { method: "POST", body: form });
    if (!res.ok) {
      console.error(`[notifications/telegram] sendDocument FAILED -> ${chatId}: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[notifications/telegram] sendDocument FAILED -> ${chatId}:`, err);
    return false;
  }
}
