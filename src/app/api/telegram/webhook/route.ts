import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { sendTelegramMessage, sendTelegramDocument, getTelegramFileBuffer } from "@/lib/notifications/telegram";
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
import { parseProgressReportCommand } from "@/lib/ai/parse-progress-report-command";
import { simulateProgressReportFromDocument } from "@/lib/workflows/telegram-progress-report";
import { isExtractableMimeType } from "@/lib/ai/client";
import { uploadDocument } from "@/lib/workflows/documents";
import { generateProgressReportForActor } from "@/server/projects/progress-reports";
import { renderProgressReportPdf } from "@/lib/pdf/render-progress-report-pdf";

const PENDING_TTL_MINUTES = 10;
const CONFIRM_WORDS = new Set(["ya", "iya", "y", "yes", "ok", "oke"]);
const CANCEL_WORDS = new Set(["batal", "tidak", "no", "cancel"]);
const NEW_COSTING_TRIGGER = /\b(buat|bikin)\s+costing\b/i;
const NEW_INVOICE_TRIGGER = /\b(buat|bikin)\s+invoice\b/i;
const NEW_PROGRESS_REPORT_TRIGGER = /\b(progress\s*report|laporan)\b/i;

interface TelegramAttachment {
  fileId: string;
  fileName: string;
  mimeType: string;
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    caption?: string;
    document?: { file_id: string; file_name?: string; mime_type?: string };
    photo?: { file_id: string; width: number; height: number }[];
  };
}

/**
 * Single entry point for the quotation-revision + progress-report-from-file
 * automation (see the Telegram chat with @BotFather, then `setWebhook` with
 * this route's public URL + `secret_token` matching TELEGRAM_WEBHOOK_SECRET —
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
  const message = update?.message;
  const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
  // A file sent with a caption puts the user's words in `caption`, not
  // `text` — treat either as "the text of this message" everywhere below.
  const text = (message?.text ?? message?.caption ?? "").trim();
  const attachment: TelegramAttachment | null = message?.document
    ? { fileId: message.document.file_id, fileName: message.document.file_name || "document.pdf", mimeType: message.document.mime_type || "application/pdf" }
    : message?.photo && message.photo.length > 0
      ? { fileId: message.photo[message.photo.length - 1].file_id, fileName: "photo.jpg", mimeType: "image/jpeg" }
      : null;
  if (!chatId || (!text && !attachment)) return NextResponse.json({ ok: true });

  try {
    await handleMessage(chatId, text, attachment);
  } catch (err) {
    console.error("[telegram-webhook] unhandled error:", err);
    await sendTelegramMessage(chatId, "Terjadi kesalahan tak terduga — coba lagi, atau hubungi Admin.");
  }
  return NextResponse.json({ ok: true });
}

async function handleMessage(chatId: string, text: string, attachment: TelegramAttachment | null) {
  const actor = await resolveActorByTelegramChatId(chatId);
  if (!actor) {
    await sendTelegramMessage(
      chatId,
      `Chat ID Anda: ${chatId}\n\nNomor ini belum terdaftar. Minta Admin mendaftarkan Chat ID ini di halaman Edit User Anda (Pengaturan > Users) sebelum bisa dipakai.`
    );
    return;
  }

  const pendingProgressReport = await prisma.telegramPendingProgressReport.findFirst({
    where: { chatId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (pendingProgressReport) {
    const normalized = text.trim().toLowerCase();
    if (CONFIRM_WORDS.has(normalized)) {
      await prisma.telegramPendingProgressReport.deleteMany({ where: { chatId } });
      try {
        requirePermission(actor.role, "project", "create");
      } catch (err) {
        await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin membuat progress report.");
        return;
      }
      try {
        const buffer = Buffer.from(pendingProgressReport.dataBase64, "base64");
        const folder = await prisma.folder.findFirst({
          where: { projectId: pendingProgressReport.projectId, routeKey: "PROJECT/PROGRESS_REPORT" },
        });
        const doc = await uploadDocument(
          {
            buffer,
            originalName: pendingProgressReport.fileName,
            mimeType: pendingProgressReport.mimeType,
            folderId: folder?.id,
            projectId: pendingProgressReport.projectId,
            relatedEntityType: "PROGRESS_REPORT",
          },
          actor
        );
        const result = await generateProgressReportForActor(doc.id, pendingProgressReport.projectId, actor);
        await logActivity(prisma, {
          userId: actor.userId, action: "CREATE", entityType: "PROGRESS_REPORT", entityId: result.progressReportId,
          description: `Dibuat via Telegram oleh ${actor.name} dari "${pendingProgressReport.fileName}"`,
        });
        const { buffer: pdfBuffer, fileName: pdfFileName } = await renderProgressReportPdf(result.progressReportId);
        await sendTelegramDocument(
          chatId,
          pdfBuffer,
          pdfFileName,
          `Progress report untuk project ${pendingProgressReport.projectNumber} berhasil dibuat, lengkap dengan foto dari dokumen aslinya.`
        );
      } catch (err) {
        console.error("[telegram-webhook] progress report commit failed:", err);
        await sendTelegramMessage(chatId, `Gagal membuat progress report: ${err instanceof Error ? err.message : "kesalahan tidak diketahui"}`);
      }
      return;
    }
    if (CANCEL_WORDS.has(normalized)) {
      await prisma.telegramPendingProgressReport.deleteMany({ where: { chatId } });
      await sendTelegramMessage(chatId, "Dibatalkan — tidak ada yang tersimpan.");
      return;
    }
    await sendTelegramMessage(chatId, 'Masih menunggu konfirmasi progress report sebelumnya — balas "ya" atau "batal" dulu.');
    return;
  }

  if (attachment) {
    if (!NEW_PROGRESS_REPORT_TRIGGER.test(text)) {
      await sendTelegramMessage(
        chatId,
        'File diterima, tapi belum jelas mau diapakan. Untuk membuat progress report dari file ini, kirim ulang dengan caption yang menyebutkan "progress report" dan nomor project-nya, contoh: "Progress report project 001/PRJ/OPS/VIII/2026".'
      );
      return;
    }
    try {
      requirePermission(actor.role, "project", "create");
    } catch (err) {
      await sendTelegramMessage(chatId, err instanceof ForbiddenError ? err.message : "Anda tidak punya izin membuat progress report.");
      return;
    }
    if (!isExtractableMimeType(attachment.mimeType)) {
      await sendTelegramMessage(chatId, `Tipe file "${attachment.mimeType}" tidak didukung — lampirkan PDF atau foto.`);
      return;
    }
    const buffer = await getTelegramFileBuffer(attachment.fileId);
    if (!buffer) {
      await sendTelegramMessage(chatId, "Gagal mengunduh file dari Telegram — coba kirim ulang.");
      return;
    }
    const parsed = await parseProgressReportCommand(text);
    const simulation = await simulateProgressReportFromDocument(parsed.projectNumber, attachment.fileName);
    if (!simulation.ok || !simulation.projectId || !simulation.projectNumber) {
      await sendTelegramMessage(chatId, simulation.error ?? "Gagal memproses permintaan progress report.");
      return;
    }
    await prisma.telegramPendingProgressReport.deleteMany({ where: { chatId } });
    await prisma.telegramPendingProgressReport.create({
      data: {
        chatId,
        projectId: simulation.projectId,
        projectNumber: simulation.projectNumber,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        dataBase64: buffer.toString("base64"),
        previewText: simulation.previewText ?? "",
        expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000),
      },
    });
    await sendTelegramMessage(chatId, simulation.previewText ?? "");
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
