import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { approveQuotation, rejectQuotation } from "@/lib/workflows/quotation";
import { approveInvoice, rejectInvoice } from "@/lib/workflows/finance";
import { approveVendorPO, rejectVendorPO } from "@/lib/workflows/vendor-po";
import { approveExpense, rejectExpense } from "@/lib/workflows/expense";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";

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
    default:
      throw new ForbiddenError(`Aksi "${toolName}" tidak dikenali.`);
  }
}
