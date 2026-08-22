import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { sendTelegramMessage, sendTelegramDocument } from "@/lib/notifications/telegram";
import { parseRevisionCommand, type RevisionAction } from "@/lib/ai/parse-revision-command";
import { resolveActorByTelegramChatId, simulateQuotationRevision, commitQuotationRevision } from "@/lib/workflows/telegram-automation";
import { parseCostingDraftMessage } from "@/lib/ai/parse-costing-draft";
import {
  getActiveCostingDraft,
  startCostingDraft,
  cancelCostingDraft,
  mergeExtractionIntoDraft,
  saveDraftMerge,
  whatsMissing,
  buildDraftPreview,
  commitCostingDraft,
} from "@/lib/workflows/telegram-costing-draft";
import { parseInvoiceCommand } from "@/lib/ai/parse-invoice-command";
import { simulateInvoice, commitInvoice } from "@/lib/workflows/telegram-invoice";

const PENDING_TTL_MINUTES = 10;
const CONFIRM_WORDS = new Set(["ya", "iya", "y", "yes", "ok", "oke"]);
const CANCEL_WORDS = new Set(["batal", "tidak", "no", "cancel"]);
const NEW_COSTING_TRIGGER = /\b(buat|bikin)\s+costing\b/i;
const NEW_INVOICE_TRIGGER = /\b(buat|bikin)\s+invoice\b/i;

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

  const costingDraft = await getActiveCostingDraft(chatId);
  if (costingDraft) {
    const normalized = text.trim().toLowerCase();
    if (costingDraft.stage === "CONFIRMING" && CONFIRM_WORDS.has(normalized)) {
      try {
        requirePermission(actor.role, "sales", "create");
      } catch (err) {
        await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin membuat costing sheet.");
        return;
      }
      try {
        const result = await commitCostingDraft(costingDraft, actor);
        await logActivity(prisma, {
          userId: actor.userId, action: "CREATE", entityType: "COSTING", entityId: result.costingSheetNumber,
          description: `${result.costingSheetNumber}: Dibuat via Telegram oleh ${actor.name}`,
        });
        await sendTelegramMessage(
          chatId,
          `Costing sheet ${result.costingSheetNumber} tersimpan sebagai DRAFT. Buka di app untuk cek ulang, lengkapi section, lalu convert ke Quotation.`
        );
      } catch (err) {
        console.error("[telegram-webhook] costing commit failed:", err);
        await sendTelegramMessage(chatId, `Gagal menyimpan costing: ${err instanceof Error ? err.message : "kesalahan tidak diketahui"}`);
      }
      return;
    }
    if (CANCEL_WORDS.has(normalized)) {
      await cancelCostingDraft(chatId);
      await sendTelegramMessage(chatId, "Draft costing dibatalkan — tidak ada yang tersimpan.");
      return;
    }
    // Any other message while a draft is open is more info for the SAME
    // draft (another item, the customer name, project title, ...) — never
    // routed to the revision flow below, so the two can't get tangled.
    const extraction = await parseCostingDraftMessage(text);
    const merge = await mergeExtractionIntoDraft(costingDraft, extraction);
    const updated = await saveDraftMerge(costingDraft.id, merge);
    if (merge.notes.length > 0) {
      await sendTelegramMessage(chatId, merge.notes.join("\n"));
    }
    if (updated.stage === "CONFIRMING") {
      await sendTelegramMessage(chatId, buildDraftPreview(updated));
    } else if (merge.notes.length === 0) {
      await sendTelegramMessage(chatId, `Masih perlu: ${whatsMissing(updated)}.`);
    }
    return;
  }

  if (NEW_COSTING_TRIGGER.test(text)) {
    try {
      requirePermission(actor.role, "sales", "create");
    } catch (err) {
      await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin membuat costing sheet.");
      return;
    }
    await startCostingDraft(chatId);
    const draft = await getActiveCostingDraft(chatId);
    const extraction = await parseCostingDraftMessage(text);
    const merge = await mergeExtractionIntoDraft(draft!, extraction);
    const updated = await saveDraftMerge(draft!.id, merge);
    if (merge.notes.length > 0) {
      await sendTelegramMessage(chatId, merge.notes.join("\n"));
    }
    if (updated.stage === "CONFIRMING") {
      await sendTelegramMessage(chatId, buildDraftPreview(updated));
    } else {
      await sendTelegramMessage(
        chatId,
        `Oke, buat costing baru. Masih perlu: ${whatsMissing(updated)}.\n\nContoh: "untuk PT ABC, project Ganti Bearing Motor, item Bearing 6205 qty 10 pcs harga modal 50000 margin 20%"`
      );
    }
    return;
  }

  const pendingInvoice = await prisma.telegramPendingInvoice.findFirst({
    where: { chatId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (pendingInvoice) {
    const normalized = text.trim().toLowerCase();
    if (CONFIRM_WORDS.has(normalized)) {
      await prisma.telegramPendingInvoice.deleteMany({ where: { chatId } });
      try {
        requirePermission(actor.role, "finance", "create");
      } catch (err) {
        await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin membuat invoice.");
        return;
      }
      try {
        const result = await commitInvoice(
          {
            projectId: pendingInvoice.projectId,
            customerId: pendingInvoice.customerId,
            quotationId: pendingInvoice.quotationId,
            amount: Number(pendingInvoice.amount),
            dpPercent: pendingInvoice.dpPercent != null ? Number(pendingInvoice.dpPercent) : null,
            dueDate: pendingInvoice.dueDate.toISOString(),
          },
          actor
        );
        await logActivity(prisma, {
          userId: actor.userId, action: "CREATE", entityType: "INVOICE", entityId: result.invoiceNumber,
          description: `${result.invoiceNumber}: Dibuat via Telegram oleh ${actor.name}`,
        });
        await sendTelegramMessage(chatId, `Invoice ${result.invoiceNumber} tersimpan sebagai DRAFT. Masih perlu submit + approval Admin di app.`);
      } catch (err) {
        console.error("[telegram-webhook] invoice commit failed:", err);
        await sendTelegramMessage(chatId, `Gagal menyimpan invoice: ${err instanceof Error ? err.message : "kesalahan tidak diketahui"}`);
      }
      return;
    }
    if (CANCEL_WORDS.has(normalized)) {
      await prisma.telegramPendingInvoice.deleteMany({ where: { chatId } });
      await sendTelegramMessage(chatId, "Dibatalkan — tidak ada yang tersimpan.");
      return;
    }
    await sendTelegramMessage(chatId, 'Masih menunggu konfirmasi invoice sebelumnya — balas "ya" atau "batal" dulu.');
    return;
  }

  if (NEW_INVOICE_TRIGGER.test(text)) {
    try {
      requirePermission(actor.role, "finance", "create");
    } catch (err) {
      await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin membuat invoice.");
      return;
    }
    const parsed = await parseInvoiceCommand(text);
    const simulation = await simulateInvoice(parsed.projectNumber, parsed.amount, parsed.dpPercent, parsed.dueInDays);
    if (!simulation.ok || !simulation.projectId || !simulation.customerId || simulation.amount == null || !simulation.dueDate) {
      await sendTelegramMessage(chatId, simulation.error ?? "Gagal memproses permintaan invoice.");
      return;
    }
    await prisma.telegramPendingInvoice.deleteMany({ where: { chatId } });
    await prisma.telegramPendingInvoice.create({
      data: {
        chatId,
        projectId: simulation.projectId,
        customerId: simulation.customerId,
        quotationId: simulation.quotationId ?? null,
        amount: simulation.amount,
        dpPercent: parsed.dpPercent,
        dueDate: new Date(simulation.dueDate),
        previewText: simulation.previewText ?? "",
        expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000),
      },
    });
    await sendTelegramMessage(chatId, simulation.previewText ?? "");
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
