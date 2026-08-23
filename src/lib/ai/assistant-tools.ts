import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { approveQuotation, rejectQuotation } from "@/lib/workflows/quotation";
import { approveInvoice, rejectInvoice } from "@/lib/workflows/finance";
import { approveVendorPO, rejectVendorPO } from "@/lib/workflows/vendor-po";
import { approveExpense, rejectExpense } from "@/lib/workflows/expense";
import { createCostingSheet, convertCostingToQuotation } from "@/lib/workflows/costing";
import { searchCustomerCandidates } from "@/lib/workflows/telegram-costing-draft";
import { calcCostingSummary, computeBillingSchedule } from "@/lib/workflows/calculations";
import { simulateQuotationRevision, commitQuotationRevision } from "@/lib/workflows/telegram-automation";
import { simulateInvoice, commitInvoice } from "@/lib/workflows/telegram-invoice";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RevisionAction } from "@/lib/ai/parse-revision-command";
import type { CostingSheetInput, CostingLineItemInput } from "@/lib/validation/costing";
import type { SessionPayload } from "@/lib/auth/session";

function clampLimit(input: unknown, def = 15, max = 30): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

/** Strips the Telegram-specific *bold* markdown and "Balas ya/batal" instruction line from a shared preview string — this chat has its own Confirm/Cancel buttons instead of a text reply. */
function cleanPreview(text: string): string {
  return text.replace(/\*/g, "").split("\n\nBalas")[0].trim();
}

/**
 * The closed set of tools the in-app AI assistant may call — same "narrow,
 * explicit vocabulary" philosophy as the Telegram automation's
 * parse-revision-command.ts: every tool maps 1:1 onto a real, already-built
 * app function (never a raw DB write, never SQL the model wrote itself).
 *
 * Read tools execute immediately and return real data. Write tools (see
 * WRITE_TOOLS below) never mutate anything on the first call — they only
 * describe what WOULD happen and hand back a pendingActionId; the actual
 * mutation only runs from confirmAssistantAction() after the user clicks
 * Confirm in the chat UI, which re-checks the same permission gate again
 * before touching anything.
 */

export const WRITE_TOOLS = new Set([
  "approve_quotation",
  "reject_quotation",
  "approve_invoice",
  "reject_invoice",
  "approve_vendor_po",
  "reject_vendor_po",
  "approve_expense",
  "reject_expense",
  "create_costing_sheet",
  "convert_costing_to_quotation",
  "revise_quotation",
  "create_invoice",
]);

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_quotation_status",
    description: "Cek status, customer, nilai, dan siapa yang submit satu quotation berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { quotationNumber: { type: "string", description: "Nomor quotation, boleh sebagian (mis. '003')." } },
      required: ["quotationNumber"],
    },
  },
  {
    name: "list_pending_approvals",
    description:
      "Daftar SEMUA dokumen yang sedang menunggu approval Direktur di seluruh modul — quotation, invoice, vendor PO, dan project expense sekaligus, bukan cuma quotation.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_project_status",
    description: "Cek progress, deadline, PM, dan status satu project berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { projectNumber: { type: "string", description: "Nomor project, boleh sebagian." } },
      required: ["projectNumber"],
    },
  },
  {
    name: "get_invoice_status",
    description: "Cek status, customer, nilai, dan due date satu invoice berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { invoiceNumber: { type: "string", description: "Nomor invoice, boleh sebagian." } },
      required: ["invoiceNumber"],
    },
  },
  {
    name: "get_vendor_po_status",
    description: "Cek status, vendor, dan nilai satu Vendor Purchase Order berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { poNumber: { type: "string", description: "Nomor Vendor PO, boleh sebagian." } },
      required: ["poNumber"],
    },
  },
  {
    name: "get_expense_status",
    description: "Cek status, kategori, dan nilai satu project expense berdasarkan nomornya.",
    input_schema: {
      type: "object",
      properties: { expenseNumber: { type: "string", description: "Nomor expense, boleh sebagian." } },
      required: ["expenseNumber"],
    },
  },
  {
    name: "get_billing_schedule",
    description:
      "Cari SEMUA project yang masih ada sisa tagihan (belum ditagih/belum full di-invoice) — persis data yang sama dengan halaman 'Billing Schedule' di app. Nilai remainingToBill dihitung dari total nilai PO customer dikurangi total yang sudah di-invoice. Pakai ini untuk pertanyaan seperti 'project apa aja yang belum ditagih' atau 'siapa yang masih ada piutang belum di-invoice'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description:
      "Cari/daftar banyak project sekaligus dengan filter opsional — untuk pertanyaan umum seperti 'project apa aja yang lagi ACTIVE', 'project customer X', bukan cuma satu nomor spesifik.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PLANNING", "ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED", "CLOSED"], description: "Filter status project (opsional)." },
        customerName: { type: "string", description: "Filter nama customer, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_invoices",
    description:
      "Cari/daftar banyak invoice sekaligus dengan filter opsional — untuk pertanyaan umum seperti 'invoice yang overdue', 'invoice customer X', 'invoice project Y', bukan cuma satu nomor spesifik.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"], description: "Filter status invoice (opsional)." },
        customerName: { type: "string", description: "Filter nama customer, boleh sebagian (opsional)." },
        projectNumber: { type: "string", description: "Filter nomor project, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_quotations",
    description:
      "Cari/daftar banyak quotation sekaligus dengan filter opsional — termasuk yang sudah WON/LOST/SENT, bukan cuma yang sedang menunggu approval (pakai list_pending_approvals untuk itu).",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SENT", "WON", "LOST", "EXPIRED", "CANCELLED"], description: "Filter status quotation (opsional)." },
        customerName: { type: "string", description: "Filter nama customer, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_vendor_pos",
    description: "Cari/daftar banyak Vendor Purchase Order sekaligus dengan filter opsional.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SENT", "CONFIRMED", "CANCELLED"], description: "Filter status Vendor PO (opsional)." },
        vendorName: { type: "string", description: "Filter nama vendor, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "list_expenses",
    description: "Cari/daftar banyak project expense sekaligus dengan filter opsional.",
    input_schema: {
      type: "object",
      properties: {
        approvalStatus: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"], description: "Filter status approval (opsional)." },
        category: { type: "string", enum: ["LABOR", "MATERIALS", "TRANSPORTATION", "ACCOMMODATION", "VENDOR", "EQUIPMENT", "MARKETING", "OTHER"], description: "Filter kategori (opsional)." },
        projectNumber: { type: "string", description: "Filter nomor project, boleh sebagian (opsional)." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
    },
  },
  {
    name: "search_customers",
    description: "Cari customer berdasarkan nama (boleh sebagian) — untuk pertanyaan seperti 'kita punya customer apa aja namanya mengandung X'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nama customer, boleh sebagian." },
        limit: { type: "number", description: "Maksimal hasil (opsional, default 15, maks 30)." },
      },
      required: ["query"],
    },
  },
  {
    name: "approve_quotation",
    description: "Approve satu quotation yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { quotationNumber: { type: "string", description: "Nomor quotation yang mau di-approve." } },
      required: ["quotationNumber"],
    },
  },
  {
    name: "reject_quotation",
    description: "Reject satu quotation yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        quotationNumber: { type: "string", description: "Nomor quotation yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["quotationNumber", "reason"],
    },
  },
  {
    name: "approve_invoice",
    description: "Approve satu invoice yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { invoiceNumber: { type: "string", description: "Nomor invoice yang mau di-approve." } },
      required: ["invoiceNumber"],
    },
  },
  {
    name: "reject_invoice",
    description: "Reject satu invoice yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor invoice yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["invoiceNumber", "reason"],
    },
  },
  {
    name: "approve_vendor_po",
    description: "Approve satu Vendor PO yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { poNumber: { type: "string", description: "Nomor Vendor PO yang mau di-approve." } },
      required: ["poNumber"],
    },
  },
  {
    name: "reject_vendor_po",
    description: "Reject satu Vendor PO yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        poNumber: { type: "string", description: "Nomor Vendor PO yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["poNumber", "reason"],
    },
  },
  {
    name: "approve_expense",
    description: "Approve satu project expense yang sedang menunggu approval. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { expenseNumber: { type: "string", description: "Nomor expense yang mau di-approve." } },
      required: ["expenseNumber"],
    },
  },
  {
    name: "reject_expense",
    description: "Reject satu project expense yang sedang menunggu approval, dengan alasan. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        expenseNumber: { type: "string", description: "Nomor expense yang mau di-reject." },
        reason: { type: "string", description: "Alasan penolakan." },
      },
      required: ["expenseNumber", "reason"],
    },
  },
  {
    name: "create_costing_sheet",
    description:
      "Buat costing sheet baru (status DRAFT) untuk satu customer/project, dengan satu atau lebih item (nama, qty, unit, harga modal, margin%). TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat. Jangan pernah menebak angka qty/harga/margin yang tidak disebutkan user secara eksplisit — tanya dulu kalau belum lengkap.",
    input_schema: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Nama customer (boleh sebagian/mirip), akan dicocokkan ke data customer yang ada." },
        projectTitle: { type: "string", description: "Judul/nama project untuk costing ini." },
        jobNo: { type: "string", description: "Nomor job internal (opsional)." },
        operationalCost: { type: "number", description: "Biaya operasional tambahan di luar item (opsional, default 0)." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nama item/pekerjaan." },
              quantity: { type: "number", description: "Kuantitas." },
              unit: { type: "string", description: "Satuan, mis. pcs/lot/unit." },
              costUnitPrice: { type: "number", description: "Harga modal per unit (Rupiah)." },
              supplierDiscountPercent: { type: "number", description: "Diskon dari supplier dalam persen (opsional, default 0)." },
              marginPercent: { type: "number", description: "Margin keuntungan dalam persen." },
            },
            required: ["name", "quantity", "unit", "costUnitPrice", "marginPercent"],
          },
        },
      },
      required: ["customerName", "projectTitle", "items"],
    },
  },
  {
    name: "convert_costing_to_quotation",
    description:
      "Ubah satu costing sheet (yang sudah ada, status belum CONVERTED) menjadi Quotation baru — persis alur 'Buat Quotation' di app. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: { costingNumber: { type: "string", description: "Nomor costing sheet, boleh sebagian." } },
      required: ["costingNumber"],
    },
  },
  {
    name: "revise_quotation",
    description:
      "Revisi satu quotation yang sudah ada, lewat costing yang menjadi dasarnya — persis alur revisi quotation yang sudah dipakai lewat Telegram. Hanya mendukung TIGA jenis perubahan (jangan menebak jenis lain): 'percent_adjustment' (naik/turunkan harga jual X%, pakai percent negatif untuk turun), 'operational_cost_delta' (tambah/kurangi biaya operasional sejumlah Rupiah, pakai amount negatif untuk kurangi), atau 'item_quantity' (ubah qty satu item tertentu berdasarkan namanya). TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        quotationNumber: { type: "string", description: "Nomor quotation yang mau direvisi." },
        adjustmentType: { type: "string", enum: ["percent_adjustment", "operational_cost_delta", "item_quantity"] },
        percent: { type: "number", description: "Wajib diisi kalau adjustmentType = percent_adjustment." },
        amount: { type: "number", description: "Wajib diisi kalau adjustmentType = operational_cost_delta." },
        itemName: { type: "string", description: "Wajib diisi kalau adjustmentType = item_quantity." },
        quantity: { type: "number", description: "Wajib diisi kalau adjustmentType = item_quantity." },
      },
      required: ["quotationNumber", "adjustmentType"],
    },
  },
  {
    name: "create_invoice",
    description:
      "Buat invoice baru (status DRAFT) untuk satu project. Jumlah HARUS Rupiah eksplisit yang disebutkan user sendiri — jangan pernah menghitung dari persentase. Invoice pertama untuk sebuah project otomatis ditautkan ke quotation asalnya (jadi 'invoice DP'); invoice berikutnya tidak. TIDAK langsung dieksekusi — akan menunggu konfirmasi user di chat.",
    input_schema: {
      type: "object",
      properties: {
        projectNumber: { type: "string", description: "Nomor project yang mau ditagih, boleh sebagian." },
        amount: { type: "number", description: "Jumlah tagihan dalam Rupiah, disebutkan eksplisit oleh user." },
        dpPercent: { type: "number", description: "Opsional, hanya untuk label 'DP X%' di deskripsi invoice — tidak memengaruhi amount." },
        dueInDays: { type: "number", description: "Opsional, jatuh tempo berapa hari dari sekarang (default 30)." },
      },
      required: ["projectNumber", "amount"],
    },
  },
];

export interface ToolExecutionResult {
  resultText: string;
  pendingAction?: { toolName: string; args: Record<string, unknown>; description: string };
}

async function findQuotationByNumber(numberFragment: string) {
  return prisma.quotation.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, revision: true, status: true, grandTotal: true,
      customer: { select: { companyName: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findInvoiceByNumber(numberFragment: string) {
  return prisma.invoice.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, status: true, grandTotal: true, dueDate: true,
      customer: { select: { companyName: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findVendorPOByNumber(numberFragment: string) {
  return prisma.vendorPurchaseOrder.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, status: true, grandTotal: true, vendorName: true,
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findCostingByNumber(numberFragment: string) {
  return prisma.costingSheet.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    include: {
      customer: { select: { companyName: true } },
      quotation: { select: { number: true } },
      sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function findExpenseByNumber(numberFragment: string) {
  return prisma.projectExpense.findFirst({
    where: { deletedAt: null, number: { contains: numberFragment, mode: "insensitive" } },
    select: {
      id: true, number: true, approvalStatus: true, category: true, total: true,
      project: { select: { name: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function executeAssistantTool(
  toolName: string,
  input: Record<string, unknown>,
  actor: SessionPayload
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case "get_quotation_status": {
      requirePermission(actor.role, "sales", "view");
      const q = await findQuotationByNumber(String(input.quotationNumber ?? ""));
      if (!q) return { resultText: `Quotation "${input.quotationNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName}\n` +
          `Status: ${q.status}\nNilai: ${formatCurrency(Number(q.grandTotal))}\n` +
          `Submitted by: ${q.submittedBy?.name ?? "-"}`,
      };
    }

    case "list_pending_approvals": {
      requirePermission(actor.role, "sales", "view");
      const [quotations, invoices, vendorPOs, expenses] = await Promise.all([
        prisma.quotation.findMany({
          where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
          select: { number: true, revision: true, grandTotal: true, customer: { select: { companyName: true } } },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
        prisma.invoice.findMany({
          where: { deletedAt: null, status: "SUBMITTED" },
          select: { number: true, grandTotal: true, customer: { select: { companyName: true } } },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
        prisma.vendorPurchaseOrder.findMany({
          where: { deletedAt: null, status: "SUBMITTED" },
          select: { number: true, grandTotal: true, vendorName: true },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
        prisma.projectExpense.findMany({
          where: { deletedAt: null, approvalStatus: "SUBMITTED" },
          select: { number: true, total: true, project: { select: { name: true } } },
          orderBy: { submittedAt: "asc" },
          take: 20,
        }),
      ]);

      if (quotations.length + invoices.length + vendorPOs.length + expenses.length === 0) {
        return { resultText: "Tidak ada dokumen apapun yang menunggu approval saat ini." };
      }

      const sections: string[] = [];
      if (quotations.length > 0) {
        sections.push(
          `Quotation:\n` +
            quotations
              .map((q) => `- ${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName} — ${formatCurrency(Number(q.grandTotal))}`)
              .join("\n")
        );
      }
      if (invoices.length > 0) {
        sections.push(
          `Invoice:\n` + invoices.map((i) => `- ${i.number} — ${i.customer.companyName} — ${formatCurrency(Number(i.grandTotal))}`).join("\n")
        );
      }
      if (vendorPOs.length > 0) {
        sections.push(
          `Vendor PO:\n` + vendorPOs.map((p) => `- ${p.number} — ${p.vendorName} — ${formatCurrency(Number(p.grandTotal))}`).join("\n")
        );
      }
      if (expenses.length > 0) {
        sections.push(
          `Project Expense:\n` +
            expenses.map((e) => `- ${e.number} — ${e.project.name} — ${formatCurrency(Number(e.total))}`).join("\n")
        );
      }
      return { resultText: sections.join("\n\n") };
    }

    case "get_project_status": {
      requirePermission(actor.role, "project", "view");
      const p = await prisma.project.findFirst({
        where: { deletedAt: null, number: { contains: String(input.projectNumber ?? ""), mode: "insensitive" } },
        select: {
          number: true, name: true, status: true, progressPercent: true, endDate: true,
          customer: { select: { companyName: true } },
          projectManager: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!p) return { resultText: `Project "${input.projectNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${p.number} — ${p.name} (${p.customer.companyName})\n` +
          `Status: ${p.status} — Progress: ${p.progressPercent}%\n` +
          `PM: ${p.projectManager?.name ?? "-"} — Deadline: ${p.endDate ? formatDate(p.endDate) : "-"}`,
      };
    }

    case "get_invoice_status": {
      requirePermission(actor.role, "finance", "view");
      const inv = await findInvoiceByNumber(String(input.invoiceNumber ?? ""));
      if (!inv) return { resultText: `Invoice "${input.invoiceNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${inv.number} — ${inv.customer.companyName}\n` +
          `Status: ${inv.status}\nNilai: ${formatCurrency(Number(inv.grandTotal))}\nJatuh tempo: ${formatDate(inv.dueDate)}\n` +
          `Submitted by: ${inv.submittedBy?.name ?? "-"}`,
      };
    }

    case "get_vendor_po_status": {
      requirePermission(actor.role, "sales", "view");
      const po = await findVendorPOByNumber(String(input.poNumber ?? ""));
      if (!po) return { resultText: `Vendor PO "${input.poNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${po.number} — ${po.vendorName}\n` +
          `Status: ${po.status}\nNilai: ${formatCurrency(Number(po.grandTotal))}\n` +
          `Submitted by: ${po.submittedBy?.name ?? "-"}`,
      };
    }

    case "get_expense_status": {
      requirePermission(actor.role, "project", "view");
      const exp = await findExpenseByNumber(String(input.expenseNumber ?? ""));
      if (!exp) return { resultText: `Expense "${input.expenseNumber}" tidak ditemukan.` };
      return {
        resultText:
          `${exp.number} — ${exp.project.name} (${exp.category})\n` +
          `Status: ${exp.approvalStatus}\nNilai: ${formatCurrency(Number(exp.total))}\n` +
          `Submitted by: ${exp.submittedBy?.name ?? "-"}`,
      };
    }

    case "get_billing_schedule": {
      requirePermission(actor.role, "finance", "view");
      const projects = await prisma.project.findMany({
        where: { deletedAt: null },
        select: {
          id: true, number: true,
          customer: { select: { companyName: true } },
          purchaseOrders: {
            where: { deletedAt: null },
            select: { id: true, number: true, poValue: true, status: true, paymentTerms: true, estimatedDeliveryDate: true },
          },
          invoices: { where: { deletedAt: null }, select: { grandTotal: true, dpPercent: true, status: true } },
        },
      });
      const rows = computeBillingSchedule(projects);
      if (rows.length === 0) return { resultText: "Tidak ada project dengan sisa tagihan saat ini — semua sudah full di-invoice." };
      return {
        resultText: rows
          .slice(0, 30)
          .map(
            (r) =>
              `- ${r.projectNumber} — ${r.customerName}: sisa ${formatCurrency(r.remainingToBill)} (PO ${formatCurrency(r.totalPoValue)}, sudah invoice ${formatCurrency(r.totalInvoiced)})` +
              (r.nextBillingDate ? ` — target ${formatDate(r.nextBillingDate)}` : "")
          )
          .join("\n"),
      };
    }

    case "list_projects": {
      requirePermission(actor.role, "project", "view");
      const rows = await prisma.project.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.customerName ? { customer: { companyName: { contains: String(input.customerName), mode: "insensitive" } } } : {}),
        },
        select: { number: true, name: true, status: true, progressPercent: true, customer: { select: { companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada project yang cocok." };
      return { resultText: rows.map((p) => `- ${p.number} — ${p.name} (${p.customer.companyName}) — ${p.status}, progress ${p.progressPercent}%`).join("\n") };
    }

    case "list_invoices": {
      requirePermission(actor.role, "finance", "view");
      const rows = await prisma.invoice.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.customerName ? { customer: { companyName: { contains: String(input.customerName), mode: "insensitive" } } } : {}),
          ...(input.projectNumber ? { project: { number: { contains: String(input.projectNumber), mode: "insensitive" } } } : {}),
        },
        select: { number: true, status: true, grandTotal: true, dueDate: true, customer: { select: { companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada invoice yang cocok." };
      return {
        resultText: rows
          .map((i) => `- ${i.number} — ${i.customer.companyName} — ${i.status} — ${formatCurrency(Number(i.grandTotal))} — jatuh tempo ${formatDate(i.dueDate)}`)
          .join("\n"),
      };
    }

    case "list_quotations": {
      requirePermission(actor.role, "sales", "view");
      const rows = await prisma.quotation.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.customerName ? { customer: { companyName: { contains: String(input.customerName), mode: "insensitive" } } } : {}),
        },
        select: { number: true, revision: true, status: true, grandTotal: true, customer: { select: { companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada quotation yang cocok." };
      return {
        resultText: rows
          .map((q) => `- ${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName} — ${q.status} — ${formatCurrency(Number(q.grandTotal))}`)
          .join("\n"),
      };
    }

    case "list_vendor_pos": {
      requirePermission(actor.role, "sales", "view");
      const rows = await prisma.vendorPurchaseOrder.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: String(input.status) as never } : {}),
          ...(input.vendorName ? { vendorName: { contains: String(input.vendorName), mode: "insensitive" } } : {}),
        },
        select: { number: true, status: true, grandTotal: true, vendorName: true },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada Vendor PO yang cocok." };
      return { resultText: rows.map((p) => `- ${p.number} — ${p.vendorName} — ${p.status} — ${formatCurrency(Number(p.grandTotal))}`).join("\n") };
    }

    case "list_expenses": {
      requirePermission(actor.role, "project", "view");
      const rows = await prisma.projectExpense.findMany({
        where: {
          deletedAt: null,
          ...(input.approvalStatus ? { approvalStatus: String(input.approvalStatus) as never } : {}),
          ...(input.category ? { category: String(input.category) as never } : {}),
          ...(input.projectNumber ? { project: { number: { contains: String(input.projectNumber), mode: "insensitive" } } } : {}),
        },
        select: { number: true, approvalStatus: true, category: true, total: true, project: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada expense yang cocok." };
      return {
        resultText: rows
          .map((e) => `- ${e.number} — ${e.project.name} (${e.category}) — ${e.approvalStatus} — ${formatCurrency(Number(e.total))}`)
          .join("\n"),
      };
    }

    case "search_customers": {
      requirePermission(actor.role, "sales", "view");
      const rows = await prisma.customer.findMany({
        where: { deletedAt: null, companyName: { contains: String(input.query ?? ""), mode: "insensitive" } },
        select: { companyName: true, city: true },
        orderBy: { companyName: "asc" },
        take: clampLimit(input.limit),
      });
      if (rows.length === 0) return { resultText: "Tidak ada customer yang cocok." };
      return { resultText: rows.map((c) => `- ${c.companyName}${c.city ? ` (${c.city})` : ""}`).join("\n") };
    }

    case "approve_quotation": {
      const q = await findQuotationByNumber(String(input.quotationNumber ?? ""));
      if (!q) return { resultText: `Quotation "${input.quotationNumber}" tidak ditemukan.` };
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(q.status)) {
        return { resultText: `${q.number} berstatus ${q.status}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_quotation",
          args: { quotationId: q.id },
          description: `Approve ${q.number} — ${q.customer.companyName} (${formatCurrency(Number(q.grandTotal))})`,
        },
      };
    }

    case "reject_quotation": {
      const q = await findQuotationByNumber(String(input.quotationNumber ?? ""));
      if (!q) return { resultText: `Quotation "${input.quotationNumber}" tidak ditemukan.` };
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(q.status)) {
        return { resultText: `${q.number} berstatus ${q.status}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_quotation",
          args: { quotationId: q.id, reason },
          description: `Reject ${q.number} — ${q.customer.companyName}. Alasan: ${reason}`,
        },
      };
    }

    case "approve_invoice": {
      const inv = await findInvoiceByNumber(String(input.invoiceNumber ?? ""));
      if (!inv) return { resultText: `Invoice "${input.invoiceNumber}" tidak ditemukan.` };
      if (inv.status !== "SUBMITTED") {
        return { resultText: `${inv.number} berstatus ${inv.status}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_invoice",
          args: { invoiceId: inv.id },
          description: `Approve ${inv.number} — ${inv.customer.companyName} (${formatCurrency(Number(inv.grandTotal))})`,
        },
      };
    }

    case "reject_invoice": {
      const inv = await findInvoiceByNumber(String(input.invoiceNumber ?? ""));
      if (!inv) return { resultText: `Invoice "${input.invoiceNumber}" tidak ditemukan.` };
      if (inv.status !== "SUBMITTED") {
        return { resultText: `${inv.number} berstatus ${inv.status}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_invoice",
          args: { invoiceId: inv.id, reason },
          description: `Reject ${inv.number} — ${inv.customer.companyName}. Alasan: ${reason}`,
        },
      };
    }

    case "approve_vendor_po": {
      const po = await findVendorPOByNumber(String(input.poNumber ?? ""));
      if (!po) return { resultText: `Vendor PO "${input.poNumber}" tidak ditemukan.` };
      if (po.status !== "SUBMITTED") {
        return { resultText: `${po.number} berstatus ${po.status}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_vendor_po",
          args: { poId: po.id },
          description: `Approve ${po.number} — ${po.vendorName} (${formatCurrency(Number(po.grandTotal))})`,
        },
      };
    }

    case "reject_vendor_po": {
      const po = await findVendorPOByNumber(String(input.poNumber ?? ""));
      if (!po) return { resultText: `Vendor PO "${input.poNumber}" tidak ditemukan.` };
      if (po.status !== "SUBMITTED") {
        return { resultText: `${po.number} berstatus ${po.status}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_vendor_po",
          args: { poId: po.id, reason },
          description: `Reject ${po.number} — ${po.vendorName}. Alasan: ${reason}`,
        },
      };
    }

    case "approve_expense": {
      const exp = await findExpenseByNumber(String(input.expenseNumber ?? ""));
      if (!exp) return { resultText: `Expense "${input.expenseNumber}" tidak ditemukan.` };
      if (exp.approvalStatus !== "SUBMITTED") {
        return { resultText: `${exp.number} berstatus ${exp.approvalStatus}, tidak sedang menunggu approval.` };
      }
      return {
        resultText: "Menunggu konfirmasi user sebelum approve benar-benar dijalankan.",
        pendingAction: {
          toolName: "approve_expense",
          args: { expenseId: exp.id },
          description: `Approve ${exp.number} — ${exp.project.name} (${formatCurrency(Number(exp.total))})`,
        },
      };
    }

    case "reject_expense": {
      const exp = await findExpenseByNumber(String(input.expenseNumber ?? ""));
      if (!exp) return { resultText: `Expense "${input.expenseNumber}" tidak ditemukan.` };
      if (exp.approvalStatus !== "SUBMITTED") {
        return { resultText: `${exp.number} berstatus ${exp.approvalStatus}, tidak sedang menunggu approval.` };
      }
      const reason = String(input.reason ?? "").trim();
      if (!reason) return { resultText: "Sebutkan alasan penolakan terlebih dahulu." };
      return {
        resultText: "Menunggu konfirmasi user sebelum reject benar-benar dijalankan.",
        pendingAction: {
          toolName: "reject_expense",
          args: { expenseId: exp.id, reason },
          description: `Reject ${exp.number} — ${exp.project.name}. Alasan: ${reason}`,
        },
      };
    }

    case "create_costing_sheet": {
      requirePermission(actor.role, "sales", "create");

      const rawItems = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return { resultText: "Sebutkan minimal 1 item (nama, qty, unit, harga modal, margin%)." };

      const items: CostingLineItemInput[] = [];
      for (const raw of rawItems) {
        const name = String(raw.name ?? "").trim();
        const quantity = Number(raw.quantity);
        const unit = String(raw.unit ?? "").trim();
        const costUnitPrice = Number(raw.costUnitPrice);
        const marginPercent = Number(raw.marginPercent);
        if (!name || !unit || !Number.isFinite(quantity) || !Number.isFinite(costUnitPrice) || !Number.isFinite(marginPercent)) {
          return { resultText: `Item "${name || "(tanpa nama)"}" belum lengkap — sebutkan nama, qty, unit, harga modal, dan margin% secara eksplisit.` };
        }
        items.push({
          name,
          quantity,
          unit,
          currency: "IDR",
          costUnitPrice,
          supplierDiscountPercent: Number.isFinite(Number(raw.supplierDiscountPercent)) ? Number(raw.supplierDiscountPercent) : 0,
          marginPercent,
        });
      }

      const customerName = String(input.customerName ?? "");
      const candidates = await searchCustomerCandidates(customerName);
      if (candidates.length === 0) return { resultText: `Customer "${customerName}" tidak ditemukan.` };
      if (candidates.length > 1) {
        return { resultText: `Ada ${candidates.length} customer mirip "${customerName}": ${candidates.map((c) => c.companyName).join(", ")}. Sebutkan salah satu nama persis.` };
      }
      const customer = candidates[0];

      const projectTitle = String(input.projectTitle ?? "").trim();
      if (!projectTitle) return { resultText: "Sebutkan judul project untuk costing ini." };
      const jobNo = input.jobNo ? String(input.jobNo) : null;
      const operationalCost = Number.isFinite(Number(input.operationalCost)) ? Number(input.operationalCost) : 0;

      const summary = calcCostingSummary([{ items }], { operationalCost });
      return {
        resultText: "Menunggu konfirmasi user sebelum costing sheet benar-benar dibuat.",
        pendingAction: {
          toolName: "create_costing_sheet",
          args: { customerId: customer.id, projectTitle, jobNo, operationalCost, items },
          description:
            `Buat costing baru — ${customer.companyName} / ${projectTitle} (${items.length} item)\n` +
            `Total jual: ${formatCurrency(summary.totalRevenue)} — Margin: ${summary.grossMarginPercent}%`,
        },
      };
    }

    case "convert_costing_to_quotation": {
      requirePermission(actor.role, "sales", "create");
      const sheet = await findCostingByNumber(String(input.costingNumber ?? ""));
      if (!sheet) return { resultText: `Costing sheet "${input.costingNumber}" tidak ditemukan.` };
      if (sheet.status === "CONVERTED") {
        return { resultText: `${sheet.number} sudah dikonversi menjadi quotation ${sheet.quotation?.number ?? "-"}.` };
      }
      const summary = calcCostingSummary(
        sheet.sections.map((s) => ({
          items: s.items.map((i) => ({
            quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
            supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
          })),
        }))
      );
      return {
        resultText: "Menunggu konfirmasi user sebelum quotation benar-benar dibuat.",
        pendingAction: {
          toolName: "convert_costing_to_quotation",
          args: { costingId: sheet.id, salesPicId: actor.userId },
          description: `Buat quotation dari costing ${sheet.number} — ${sheet.customer.companyName} (${formatCurrency(summary.totalRevenue)})`,
        },
      };
    }

    case "revise_quotation": {
      requirePermission(actor.role, "sales", "update");
      const quotationNumber = String(input.quotationNumber ?? "");
      const adjustmentType = String(input.adjustmentType ?? "");

      let action: RevisionAction;
      if (adjustmentType === "percent_adjustment") {
        const percent = Number(input.percent);
        if (!Number.isFinite(percent)) return { resultText: "Sebutkan berapa persen kenaikan/penurunan harganya." };
        action = { type: "percent_adjustment", percent };
      } else if (adjustmentType === "operational_cost_delta") {
        const amount = Number(input.amount);
        if (!Number.isFinite(amount)) return { resultText: "Sebutkan berapa Rupiah perubahan biaya operasionalnya." };
        action = { type: "operational_cost_delta", amount };
      } else if (adjustmentType === "item_quantity") {
        const itemName = String(input.itemName ?? "").trim();
        const quantity = Number(input.quantity);
        if (!itemName || !Number.isFinite(quantity)) return { resultText: "Sebutkan nama item dan quantity baru-nya." };
        action = { type: "item_quantity", itemName, quantity };
      } else {
        return { resultText: "Jenis revisi tidak didukung — hanya bisa naik/turun harga %, ubah biaya operasional, atau ubah qty satu item." };
      }

      const sim = await simulateQuotationRevision(quotationNumber, action);
      if (!sim.ok) return { resultText: sim.error ?? "Gagal mensimulasikan revisi." };
      return {
        resultText: "Menunggu konfirmasi user sebelum revisi benar-benar dijalankan.",
        pendingAction: {
          toolName: "revise_quotation",
          args: { costingId: sim.costingId, action },
          description: cleanPreview(sim.previewText ?? ""),
        },
      };
    }

    case "create_invoice": {
      requirePermission(actor.role, "finance", "create");
      const projectNumber = String(input.projectNumber ?? "");
      const amount = Number(input.amount);
      const dpPercent = input.dpPercent != null ? Number(input.dpPercent) : null;
      const dueInDays = input.dueInDays != null ? Number(input.dueInDays) : null;

      const sim = await simulateInvoice(projectNumber, Number.isFinite(amount) ? amount : null, dpPercent, dueInDays);
      if (!sim.ok) return { resultText: sim.error ?? "Gagal mensimulasikan invoice." };
      return {
        resultText: "Menunggu konfirmasi user sebelum invoice benar-benar dibuat.",
        pendingAction: {
          toolName: "create_invoice",
          args: {
            projectId: sim.projectId, customerId: sim.customerId, quotationId: sim.quotationId ?? null,
            amount: sim.amount, dpPercent, dueDate: sim.dueDate,
          },
          description: cleanPreview(sim.previewText ?? ""),
        },
      };
    }

    default:
      return { resultText: `Tool "${toolName}" tidak dikenali.` };
  }
}

/** Runs the actual mutation for a confirmed write action. Re-checks permission itself (via the real workflow function) — never trusts that the assistant's earlier proposal was still valid. */
export async function runConfirmedAssistantAction(
  toolName: string,
  args: Record<string, unknown>,
  actor: SessionPayload
): Promise<string> {
  switch (toolName) {
    case "approve_quotation": {
      const q = await approveQuotation(String(args.quotationId), actor);
      return `${q.number} berhasil di-approve.`;
    }
    case "reject_quotation": {
      const q = await rejectQuotation(String(args.quotationId), String(args.reason), actor);
      return `${q.number} berhasil di-reject.`;
    }
    case "approve_invoice": {
      const inv = await approveInvoice(String(args.invoiceId), actor);
      return `${inv.number} berhasil di-approve.`;
    }
    case "reject_invoice": {
      const inv = await rejectInvoice(String(args.invoiceId), String(args.reason), actor);
      return `${inv.number} berhasil di-reject.`;
    }
    case "approve_vendor_po": {
      const po = await approveVendorPO(String(args.poId), actor);
      return `${po.number} berhasil di-approve.`;
    }
    case "reject_vendor_po": {
      const po = await rejectVendorPO(String(args.poId), String(args.reason), actor);
      return `${po.number} berhasil di-reject.`;
    }
    case "approve_expense": {
      const exp = await approveExpense(String(args.expenseId), actor);
      return `${exp.number} berhasil di-approve.`;
    }
    case "reject_expense": {
      const exp = await rejectExpense(String(args.expenseId), String(args.reason), actor);
      return `${exp.number} berhasil di-reject.`;
    }
    case "create_costing_sheet": {
      const items = args.items as CostingLineItemInput[];
      const input: CostingSheetInput = {
        customerId: String(args.customerId),
        projectTitle: String(args.projectTitle),
        jobNo: args.jobNo ? String(args.jobNo) : null,
        costingDate: new Date(),
        operationalCost: Number(args.operationalCost) || 0,
        ppnPercent: 11,
        pphFinalPercent: 2,
        sections: [{ code: "A", name: "UMUM", items }],
      };
      const sheet = await createCostingSheet(input, actor);
      return `${sheet.number} berhasil dibuat sebagai costing sheet DRAFT.`;
    }
    case "convert_costing_to_quotation": {
      const quotation = await convertCostingToQuotation(String(args.costingId), { salesPicId: String(args.salesPicId) }, actor);
      return `Quotation ${quotation.number} berhasil dibuat.`;
    }
    case "revise_quotation": {
      const result = await commitQuotationRevision(String(args.costingId), args.action as RevisionAction, actor);
      return `Quotation ${result.quotationNumber} berhasil direvisi.`;
    }
    case "create_invoice": {
      const result = await commitInvoice(
        {
          projectId: String(args.projectId),
          customerId: String(args.customerId),
          quotationId: args.quotationId ? String(args.quotationId) : null,
          amount: Number(args.amount),
          dpPercent: args.dpPercent != null ? Number(args.dpPercent) : null,
          dueDate: String(args.dueDate),
        },
        actor
      );
      return `Invoice ${result.invoiceNumber} berhasil dibuat sebagai DRAFT.`;
    }
    default:
      throw new ForbiddenError(`Aksi "${toolName}" tidak dikenali.`);
  }
}
