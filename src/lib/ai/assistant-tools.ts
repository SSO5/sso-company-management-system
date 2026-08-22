import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { approveQuotation, rejectQuotation } from "@/lib/workflows/quotation";
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

export const WRITE_TOOLS = new Set(["approve_quotation", "reject_quotation"]);

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
    description: "Daftar semua quotation yang berstatus menunggu approval (SUBMITTED/UNDER_REVIEW).",
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
      const rows = await prisma.quotation.findMany({
        where: { deletedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
        select: { number: true, revision: true, grandTotal: true, customer: { select: { companyName: true } } },
        orderBy: { submittedAt: "asc" },
        take: 20,
      });
      if (rows.length === 0) return { resultText: "Tidak ada quotation yang menunggu approval saat ini." };
      return {
        resultText: rows
          .map((q) => `- ${q.number}${q.revision > 0 ? `.R${q.revision}` : ""} — ${q.customer.companyName} — ${formatCurrency(Number(q.grandTotal))}`)
          .join("\n"),
      };
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
    default:
      throw new ForbiddenError(`Aksi "${toolName}" tidak dikenali.`);
  }
}
