import { prisma } from "@/lib/db";
import { calcCostingLine, calcCostingSummary } from "@/lib/workflows/calculations";
import { createCostingSheet } from "@/lib/workflows/costing";
import { formatCurrency } from "@/lib/utils";
import type { CostingDraftExtraction } from "@/lib/ai/parse-costing-draft";
import type { CostingSheetInput, CostingLineItemInput } from "@/lib/validation/costing";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * "Buat costing baru" via Telegram — unlike revising an existing quotation
 * (one parsed action, one confirm), a brand-new costing sheet needs several
 * pieces of information that rarely arrive in a single message: a customer,
 * a project title, and one-or-more line items (each needing quantity, cost,
 * and margin to price correctly). This accumulates a DB-backed draft across
 * turns and only ever stores a line item once it's COMPLETE — a mentioned
 * item missing quantity/cost/margin is never guessed at or defaulted; the
 * user is asked to resend that one item with the missing piece, so the
 * draft never carries an ambiguous half-filled item into the final sheet.
 */

export const COSTING_DRAFT_TTL_MINUTES = 30;

export type DraftItem = Required<Pick<CostingLineItemInput, "name" | "quantity" | "unit" | "currency" | "costUnitPrice" | "supplierDiscountPercent" | "marginPercent">>;

export interface CostingDraftRow {
  id: string;
  chatId: string;
  customerId: string | null;
  customerName: string | null;
  projectTitle: string | null;
  jobNo: string | null;
  operationalCost: number;
  items: DraftItem[];
  stage: "COLLECTING" | "CONFIRMING";
}

function rowFromPrisma(row: {
  id: string; chatId: string; customerId: string | null; customerName: string | null;
  projectTitle: string | null; jobNo: string | null; operationalCost: unknown; itemsJson: unknown; stage: string;
}): CostingDraftRow {
  return {
    id: row.id,
    chatId: row.chatId,
    customerId: row.customerId,
    customerName: row.customerName,
    projectTitle: row.projectTitle,
    jobNo: row.jobNo,
    operationalCost: Number(row.operationalCost),
    items: Array.isArray(row.itemsJson) ? (row.itemsJson as DraftItem[]) : [],
    stage: row.stage === "CONFIRMING" ? "CONFIRMING" : "COLLECTING",
  };
}

export async function getActiveCostingDraft(chatId: string): Promise<CostingDraftRow | null> {
  const row = await prisma.telegramCostingDraft.findFirst({
    where: { chatId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return row ? rowFromPrisma(row) : null;
}

export async function startCostingDraft(chatId: string): Promise<void> {
  await prisma.telegramCostingDraft.deleteMany({ where: { chatId } });
  await prisma.telegramCostingDraft.create({
    data: { chatId, expiresAt: new Date(Date.now() + COSTING_DRAFT_TTL_MINUTES * 60 * 1000) },
  });
}

export async function cancelCostingDraft(chatId: string): Promise<void> {
  await prisma.telegramCostingDraft.deleteMany({ where: { chatId } });
}

/** Up to 5 candidate customers by case-insensitive contains match on company name. */
export async function searchCustomerCandidates(query: string): Promise<{ id: string; companyName: string }[]> {
  const q = query.trim();
  if (!q) return [];
  return prisma.customer.findMany({
    where: { deletedAt: null, companyName: { contains: q, mode: "insensitive" } },
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
    take: 5,
  });
}

/**
 * Applies one message's extraction onto a draft. Returns the updated fields
 * plus human-readable notes about anything that couldn't be applied (an
 * item missing a required number, an ambiguous/unresolved customer name) so
 * the caller can ask the user for exactly that, in one bot reply.
 */
export interface MergeResult {
  customerId: string | null;
  customerName: string | null;
  projectTitle: string | null;
  jobNo: string | null;
  operationalCost: number;
  items: DraftItem[];
  notes: string[];
}

export async function mergeExtractionIntoDraft(draft: CostingDraftRow, extraction: CostingDraftExtraction): Promise<MergeResult> {
  const notes: string[] = [];
  let customerId = draft.customerId;
  let customerName = draft.customerName;

  if (!customerId && extraction.customerName) {
    const candidates = await searchCustomerCandidates(extraction.customerName);
    if (candidates.length === 1) {
      customerId = candidates[0].id;
      customerName = candidates[0].companyName;
    } else if (candidates.length === 0) {
      notes.push(`Pelanggan "${extraction.customerName}" tidak ditemukan. Sebutkan nama lain, atau minta Admin buat customer baru dulu di app.`);
    } else {
      notes.push(
        `Ada ${candidates.length} pelanggan mirip "${extraction.customerName}": ${candidates.map((c) => c.companyName).join(", ")}. Sebutkan salah satu nama persis.`
      );
    }
  }

  const projectTitle = extraction.projectTitle ?? draft.projectTitle;
  const jobNo = extraction.jobNo ?? draft.jobNo;
  const operationalCost = extraction.operationalCost ?? draft.operationalCost;

  const items = [...draft.items];
  for (const raw of extraction.items) {
    if (raw.quantity == null || raw.costUnitPrice == null || raw.marginPercent == null) {
      const missing = [
        raw.quantity == null && "quantity",
        raw.costUnitPrice == null && "harga modal",
        raw.marginPercent == null && "margin%",
      ].filter(Boolean).join(", ");
      notes.push(`Item "${raw.name}" belum lengkap (kurang: ${missing}). Kirim ulang satu baris lengkap, contoh: "${raw.name} qty 10 pcs harga modal 50000 margin 20%".`);
      continue;
    }
    items.push({
      name: raw.name,
      quantity: raw.quantity,
      unit: raw.unit ?? "lot",
      currency: "IDR",
      costUnitPrice: raw.costUnitPrice,
      supplierDiscountPercent: raw.supplierDiscountPercent ?? 0,
      marginPercent: raw.marginPercent,
    });
  }

  return { customerId, customerName, projectTitle, jobNo, operationalCost, items, notes };
}

export async function saveDraftMerge(draftId: string, merge: MergeResult): Promise<CostingDraftRow> {
  const isComplete = Boolean(merge.customerId && merge.projectTitle && merge.items.length > 0);
  const row = await prisma.telegramCostingDraft.update({
    where: { id: draftId },
    data: {
      customerId: merge.customerId,
      customerName: merge.customerName,
      projectTitle: merge.projectTitle,
      jobNo: merge.jobNo,
      operationalCost: merge.operationalCost,
      itemsJson: merge.items,
      stage: isComplete ? "CONFIRMING" : "COLLECTING",
      expiresAt: new Date(Date.now() + COSTING_DRAFT_TTL_MINUTES * 60 * 1000),
    },
  });
  return rowFromPrisma(row);
}

export function whatsMissing(draft: CostingDraftRow): string {
  const missing: string[] = [];
  if (!draft.customerId) missing.push("nama pelanggan");
  if (!draft.projectTitle) missing.push("judul project");
  if (draft.items.length === 0) missing.push("minimal 1 item (nama, qty, harga modal, margin%)");
  return missing.join(", ");
}

export function buildDraftPreview(draft: CostingDraftRow): string {
  const summary = calcCostingSummary([{ items: draft.items }], { operationalCost: draft.operationalCost });
  const lines = draft.items.map((i) => {
    const calc = calcCostingLine(i);
    return `- ${i.name}: ${i.quantity} ${i.unit} x ${formatCurrency(calc.sellingUnitPrice)} = ${formatCurrency(calc.sellingTotalPrice)}`;
  });
  return (
    `*Draft Costing — ${draft.customerName}*\n` +
    `Project: ${draft.projectTitle}${draft.jobNo ? ` (${draft.jobNo})` : ""}\n\n` +
    `${lines.join("\n")}\n\n` +
    `Total jual: ${formatCurrency(summary.totalRevenue)}\n` +
    `Margin kotor: ${summary.grossMarginPercent}%\n\n` +
    `Balas "ya" untuk simpan sebagai costing sheet (status DRAFT di app), kirim item lain untuk ditambahkan, atau "batal".`
  );
}

export interface CommitResult {
  costingSheetNumber: string;
}

export async function commitCostingDraft(draft: CostingDraftRow, actor: SessionPayload): Promise<CommitResult> {
  if (!draft.customerId || !draft.projectTitle || draft.items.length === 0) {
    throw new Error("Draft belum lengkap — tidak bisa disimpan.");
  }
  const input: CostingSheetInput = {
    customerId: draft.customerId,
    projectTitle: draft.projectTitle,
    jobNo: draft.jobNo,
    costingDate: new Date(),
    operationalCost: draft.operationalCost,
    ppnPercent: 11,
    pphFinalPercent: 2,
    sections: [{ code: "A", name: "UMUM", items: draft.items }],
  };
  const sheet = await createCostingSheet(input, actor);
  await prisma.telegramCostingDraft.deleteMany({ where: { chatId: draft.chatId } });
  return { costingSheetNumber: sheet.number };
}
