import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/workflows/finance";
import { formatCurrency } from "@/lib/utils";
import type { InvoiceInput } from "@/lib/validation/finance";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * "Buat invoice" via Telegram — single-shot like the quotation-revision flow
 * (parse -> simulate -> "ya"/"batal"), not multi-turn like the costing
 * draft, since an invoice here only ever needs 3 things: which project,
 * how much (an explicit Rupiah figure — never computed from a %), and
 * optionally a DP-label. The first invoice against a project is linked back
 * to that project's originating Quotation (a real "DP invoice"); every
 * invoice after that is project-only, matching how SSO actually bills after
 * the deposit — see lib/workflows/telegram-invoice.ts callers for the
 * discussion of why quotationId is never set past the first invoice.
 */

const DEFAULT_DUE_IN_DAYS = 30;

export interface InvoiceSimulation {
  ok: boolean;
  error?: string;
  projectId?: string;
  customerId?: string;
  quotationId?: string | null;
  amount?: number;
  dpLabel?: string | null;
  dueDate?: string; // ISO, so it round-trips through the pending-invoice JSON untouched
  previewText?: string;
}

export async function simulateInvoice(
  projectNumberRaw: string | null,
  amount: number | null,
  dpPercent: number | null,
  dueInDays: number | null
): Promise<InvoiceSimulation> {
  if (!projectNumberRaw) {
    return { ok: false, error: 'Sebutkan nomor project yang mau ditagih, contoh: "buat invoice untuk project 001/PRJ/OPS/VIII/2026, sebesar Rp150.000.000".' };
  }
  if (amount == null || amount <= 0) {
    return { ok: false, error: "Sebutkan jumlah tagihan dalam Rupiah secara eksplisit (bukan persen) — mis. \"sebesar Rp150.000.000\"." };
  }

  const project = await prisma.project.findFirst({
    where: { deletedAt: null, number: { contains: projectNumberRaw, mode: "insensitive" } },
    select: { id: true, number: true, name: true, customerId: true, quotationId: true },
  });
  if (!project) {
    return { ok: false, error: `Project "${projectNumberRaw}" tidak ditemukan.` };
  }

  const existingInvoiceCount = await prisma.invoice.count({
    where: { projectId: project.id, status: { not: "CANCELLED" }, deletedAt: null },
  });
  const isFirstInvoice = existingInvoiceCount === 0;
  const quotationId = isFirstInvoice ? project.quotationId : null;

  const dueDate = new Date(Date.now() + (dueInDays ?? DEFAULT_DUE_IN_DAYS) * 24 * 60 * 60 * 1000);
  const dpLabel = dpPercent != null ? `DP ${dpPercent}%` : null;

  const previewText =
    `*Invoice — ${project.number}*\n` +
    `${project.name}\n` +
    `Jumlah: ${formatCurrency(amount)}${dpLabel ? ` (${dpLabel})` : ""}\n` +
    `Jatuh tempo: ${dueDate.toLocaleDateString("id-ID")}\n` +
    `${isFirstInvoice ? "Invoice pertama untuk project ini — akan ditautkan ke quotation asalnya." : "Invoice lanjutan — tidak ditautkan ke quotation."}\n\n` +
    `Balas "ya" untuk simpan sebagai invoice DRAFT, atau "batal".`;

  return {
    ok: true,
    projectId: project.id,
    customerId: project.customerId,
    quotationId,
    amount,
    dpLabel,
    dueDate: dueDate.toISOString(),
    previewText,
  };
}

export interface InvoiceCommitInput {
  projectId: string;
  customerId: string;
  quotationId: string | null;
  amount: number;
  dpPercent: number | null;
  dueDate: string;
}

export async function commitInvoice(input: InvoiceCommitInput, actor: SessionPayload): Promise<{ invoiceNumber: string }> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { name: true } });
  const description = input.quotationId
    ? `Down Payment${input.dpPercent != null ? ` ${input.dpPercent}%` : ""} - ${project.name}`
    : `Termin Pembayaran - ${project.name}`;

  const invoiceInput: InvoiceInput = {
    customerId: input.customerId,
    projectId: input.projectId,
    quotationId: input.quotationId,
    invoiceDate: new Date(),
    dueDate: new Date(input.dueDate),
    dpPercent: input.dpPercent,
    discount: 0,
    items: [{ description, quantity: 1, unit: "lot", unitPrice: input.amount, taxPercent: 0, isNote: false }],
  };

  const invoice = await createInvoice(invoiceInput, actor);
  return { invoiceNumber: invoice.number };
}
