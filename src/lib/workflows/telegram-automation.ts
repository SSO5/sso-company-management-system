import { prisma } from "@/lib/db";
import { calcCostingSummary } from "@/lib/workflows/calculations";
import { applyCostingAdjustment, UnsupportedRevisionError } from "@/lib/workflows/costing-adjustment";
import { reviseCostingSheet, updateCostingSheet, convertRevisedCostingToQuotation } from "@/lib/workflows/costing";
import { renderQuotationPdf } from "@/lib/pdf/render-quotation-pdf";
import { formatCurrency, formatRevisedNumber } from "@/lib/utils";
import type { RevisionAction } from "@/lib/ai/parse-revision-command";
import type { CostingSheetInput } from "@/lib/validation/costing";
import type { SessionPayload } from "@/lib/auth/session";

const REVISABLE_QUOTATION_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SENT", "DRAFT"];

/** Chat ID -> real User, the identity check for every Telegram automation call. */
export async function resolveActorByTelegramChatId(chatId: string): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId } });
  if (!user || !user.isActive) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
}

async function loadCostingInput(costingId: string): Promise<{ input: CostingSheetInput; quotationId: string | null; quotationNumber: string | null }> {
  const sheet = await prisma.costingSheet.findUniqueOrThrow({
    where: { id: costingId },
    include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } }, quotation: { select: { id: true, number: true } } },
  });
  const input: CostingSheetInput = {
    customerId: sheet.customerId,
    opportunityId: sheet.opportunityId,
    projectTitle: sheet.projectTitle,
    jobNo: sheet.jobNo,
    costingDate: sheet.costingDate,
    notes: sheet.notes,
    operationalCost: Number(sheet.operationalCost),
    ppnPercent: Number(sheet.ppnPercent),
    pphFinalPercent: Number(sheet.pphFinalPercent),
    sections: sheet.sections.map((s) => ({
      code: s.code,
      name: s.name,
      items: s.items.map((i) => ({
        groupLabel: i.groupLabel,
        name: i.name,
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        currency: i.currency,
        costUnitPrice: Number(i.costUnitPrice),
        supplierDiscountPercent: Number(i.supplierDiscountPercent),
        marginPercent: Number(i.marginPercent),
      })),
    })),
  };
  return { input, quotationId: sheet.quotation?.id ?? null, quotationNumber: sheet.quotation?.number ?? null };
}

export interface RevisionSimulation {
  ok: boolean;
  error?: string;
  quotationId?: string;
  costingId?: string;
  previewText?: string;
}

/**
 * Fase 1 — read-only. Fetches the live costing sheet, applies the parsed
 * action IN MEMORY ONLY (applyCostingAdjustment never writes), and computes
 * what the new total/margin would be. Nothing in the database changes here.
 */
export async function simulateQuotationRevision(quotationNumber: string, action: RevisionAction): Promise<RevisionSimulation> {
  const quotation = await prisma.quotation.findFirst({ where: { number: quotationNumber, deletedAt: null } });
  if (!quotation) return { ok: false, error: `Quotation "${quotationNumber}" tidak ditemukan.` };
  if (!REVISABLE_QUOTATION_STATUSES.includes(quotation.status)) {
    return { ok: false, error: `Quotation ${quotation.number} berstatus ${quotation.status}, tidak bisa direvisi.` };
  }

  const costingSheet = await prisma.costingSheet.findUnique({ where: { quotationId: quotation.id }, select: { id: true } });
  if (!costingSheet) {
    return { ok: false, error: `Quotation ${quotation.number} tidak punya costing sheet terhubung — tidak bisa direvisi lewat sini.` };
  }

  const { input: currentInput } = await loadCostingInput(costingSheet.id);
  const currentSummary = calcCostingSummary(currentInput.sections, currentInput);

  let adjustedInput: CostingSheetInput;
  try {
    adjustedInput = applyCostingAdjustment(currentInput, action);
  } catch (err) {
    return { ok: false, error: err instanceof UnsupportedRevisionError ? err.message : "Gagal menerapkan perubahan." };
  }
  const newSummary = calcCostingSummary(adjustedInput.sections, adjustedInput);

  const previewText =
    `*${quotation.number}*\n` +
    `Total sekarang: ${formatCurrency(currentSummary.totalRevenue)} (margin ${currentSummary.grossMarginPercent}%)\n` +
    `Total baru: ${formatCurrency(newSummary.totalRevenue)} (margin ${newSummary.grossMarginPercent}%)\n\n` +
    `Balas "ya" untuk proses, atau "batal" untuk batal.`;

  return { ok: true, quotationId: quotation.id, costingId: costingSheet.id, previewText };
}

export interface RevisionCommitResult {
  quotationId: string;
  quotationNumber: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
}

/**
 * Fase 2 — only called after the human replies "ya". Re-fetches the costing
 * sheet fresh (not trusting anything computed during simulate, in case
 * something else changed it in the meantime) and re-applies the SAME stored
 * action, then runs the exact revise -> update -> convert -> render chain
 * every other revision path in the app uses.
 */
export async function commitQuotationRevision(costingId: string, action: RevisionAction, actor: SessionPayload): Promise<RevisionCommitResult> {
  await reviseCostingSheet(costingId, actor);

  const { input: currentInput } = await loadCostingInput(costingId);
  const adjustedInput = applyCostingAdjustment(currentInput, action);
  await updateCostingSheet(costingId, adjustedInput, actor);

  const quotation = await convertRevisedCostingToQuotation(costingId, actor);
  const { buffer, fileName } = await renderQuotationPdf(quotation.id);

  return {
    quotationId: quotation.id,
    quotationNumber: formatRevisedNumber(quotation.number, quotation.revision),
    pdfBuffer: buffer,
    pdfFileName: fileName,
  };
}
