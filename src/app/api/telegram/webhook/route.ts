import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { sendTelegramMessage, sendTelegramDocument } from "@/lib/notifications/telegram";
import { parseRevisionCommand, type RevisionAction } from "@/lib/ai/parse-revision-command";
import { resolveActorByTelegramChatId, simulateQuotationRevision, commitQuotationRevision } from "@/lib/workflows/telegram-automation";

const PENDING_TTL_MINUTES = 10;
const CONFIRM_WORDS = new Set(["ya", "iya", "y", "yes", "ok", "oke"]);
const CANCEL_WORDS = new Set(["batal", "tidak", "no", "cancel"]);

interface TelegramUpdate {
  message?: { chat?: { id?: number | string }; text?: string };
}

/**
 * Single entry point for the quotation-revision-via-Telegram automation
 * (see the Telegram chat with @BotFather, then `setWebhook` with this
 * route's public URL + `secret_token` matching TELEGRAM_WEBHOOK_SECRET —
 * Telegram echoes that value back on every call as the
 * x-telegram-bot-api-secret-token header, which is how this route tells a
 * genuine Telegram call apart from a stranger hitting the URL directly).
 *
 * Always returns 200 — Telegram retries aggressively on anything else, and
 * every real failure here is communicated back to the user as a chat
 * message instead, not as an HTTP error Telegram would just retry into a
 * message storm.
 */
export async function POST(req: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const chatId = update?.message?.chat?.id != null ? String(update.message.chat.id) : null;
  const text = update?.message?.text?.trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  try {
    await handleMessage(chatId, text);
  } catch (err) {
    console.error("[telegram-webhook] unhandled error:", err);
    await sendTelegramMessage(chatId, "Terjadi kesalahan tak terduga — coba lagi, atau hubungi Admin.");
  }
  return NextResponse.json({ ok: true });
}

async function handleMessage(chatId: string, text: string) {
  const actor = await resolveActorByTelegramChatId(chatId);
  if (!actor) {
    await sendTelegramMessage(
      chatId,
      `Chat ID Anda: ${chatId}\n\nNomor ini belum terdaftar. Minta Admin mendaftarkan Chat ID ini di halaman Edit User Anda (Pengaturan > Users) sebelum bisa dipakai.`
    );
    return;
  }

  const pending = await prisma.telegramPendingRevision.findFirst({
    where: { chatId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (pending) {
    const normalized = text.trim().toLowerCase();
    if (CONFIRM_WORDS.has(normalized)) {
      await prisma.telegramPendingRevision.deleteMany({ where: { chatId } });
      try {
        requirePermission(actor.role, "sales", "update");
      } catch (err) {
        await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin untuk merevisi quotation.");
        return;
      }
      const action = pending.actionJson as unknown as RevisionAction;
      try {
        const result = await commitQuotationRevision(pending.costingId, action, actor);
        await logActivity(prisma, {
          userId: actor.userId, action: "UPDATE", entityType: "QUOTATION", entityId: result.quotationId,
          description: `${result.quotationNumber}: Direvisi via Telegram oleh ${actor.name}`,
        });
        await sendTelegramDocument(
          chatId,
          result.pdfBuffer,
          result.pdfFileName,
          `${result.quotationNumber} — status DRAFT. Masih perlu submit + approval Admin di app sebelum jadi dokumen resmi.`
        );
      } catch (err) {
        console.error("[telegram-webhook] commit failed:", err);
        await sendTelegramMessage(chatId, `Gagal memproses revisi: ${err instanceof Error ? err.message : "kesalahan tidak diketahui"}`);
      }
      return;
    }
    if (CANCEL_WORDS.has(normalized)) {
      await prisma.telegramPendingRevision.deleteMany({ where: { chatId } });
      await sendTelegramMessage(chatId, "Dibatalkan — tidak ada yang berubah.");
      return;
    }
    await sendTelegramMessage(chatId, 'Masih menunggu konfirmasi revisi sebelumnya — balas "ya" atau "batal" dulu.');
    return;
  }

  try {
    requirePermission(actor.role, "sales", "update");
  } catch (err) {
    await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin untuk merevisi quotation.");
    return;
  }

  const parsed = await parseRevisionCommand(text);
  if (!parsed.quotationNumber) {
    await sendTelegramMessage(chatId, 'Sebutkan nomor quotation yang mau direvisi, contoh: "Revisi Quotation 003/QUO/MKT/VI/2026, naikkan harga 10%".');
    return;
  }
  if (parsed.action.type === "unsupported") {
    await sendTelegramMessage(
      chatId,
      `Tidak bisa memproses permintaan ini: ${parsed.action.reason}\n\nYang didukung: naikkan/turunkan harga jual (%), ubah biaya operasional, atau ubah qty satu item.`
    );
    return;
  }

  const simulation = await simulateQuotationRevision(parsed.quotationNumber, parsed.action);
  if (!simulation.ok || !simulation.quotationId || !simulation.costingId) {
    await sendTelegramMessage(chatId, simulation.error ?? "Gagal menghitung simulasi.");
    return;
  }

  await prisma.telegramPendingRevision.deleteMany({ where: { chatId } });
  await prisma.telegramPendingRevision.create({
    data: {
      chatId,
      quotationId: simulation.quotationId,
      costingId: simulation.costingId,
      actionJson: parsed.action,
      previewText: simulation.previewText ?? "",
      expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000),
    },
  });
  await sendTelegramMessage(chatId, simulation.previewText ?? "");
}
