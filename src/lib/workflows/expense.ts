import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole, notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { requireExpenseApprover } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// MAKER-CHECKER for ProjectExpense — same pattern as Quotation / Vendor PO.
// createExpense() itself still lives in server/projects/tasks.ts (unchanged);
// this file only adds the submit -> approve/reject lifecycle on top, since
// an expense recorded by any role (PM, Finance) should not count toward
// project cost control until Admin (Direktur) has approved it.
// ---------------------------------------------------------------------------

export async function submitExpenseForApproval(id: string, actor: SessionPayload) {
  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectExpense.findUniqueOrThrow({ where: { id } });
    if (existing.approvalStatus !== "DRAFT") {
      throw new Error("Only a draft expense can be submitted for approval.");
    }
    const updated = await tx.projectExpense.update({
      where: { id },
      data: { approvalStatus: "SUBMITTED", isLocked: true, submittedAt: new Date(), submittedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "PROJECT_EXPENSE", entityId: id,
      description: `${updated.number}: Draft -> Submitted for approval`,
    });
    await notifyRole(tx, "ADMIN", {
      type: "EXPENSE_APPROVAL",
      title: "Project expense awaiting approval",
      message: `${updated.number} (Rp ${Number(updated.total).toLocaleString("id-ID")}) was submitted by ${actor.name} and needs your approval.`,
      link: `/projects/${updated.projectId}`,
    });
    return updated;
  });

  await dispatchOutbound(
    { role: "ADMIN" },
    {
      title: "Biaya proyek menunggu approval",
      message: `${expense.number} (Rp ${Number(expense.total).toLocaleString("id-ID")}) diajukan oleh ${actor.name} dan menunggu approval Anda.`,
      link: `/projects/${expense.projectId}`,
    }
  ).catch((err) => console.error("[submitExpenseForApproval] dispatchOutbound failed:", err));

  return expense;
}

export async function approveExpense(id: string, actor: SessionPayload) {
  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectExpense.findUniqueOrThrow({ where: { id } });
    requireExpenseApprover(actor.role, actor.userId, existing.submittedById);
    if (existing.approvalStatus !== "SUBMITTED") {
      throw new Error("Only a submitted expense can be approved.");
    }
    const updated = await tx.projectExpense.update({
      where: { id },
      data: { approvalStatus: "APPROVED", approvedAt: new Date(), approvedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "APPROVE", entityType: "PROJECT_EXPENSE", entityId: id,
      description: `${updated.number}: Approved by ${actor.name}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "EXPENSE_APPROVED",
        title: "Project expense approved",
        message: `${updated.number} has been approved.`,
        link: `/projects/${updated.projectId}`,
      });
    }
    return updated;
  });

  if (expense.submittedById) {
    await dispatchOutbound(
      { userId: expense.submittedById },
      { title: "Biaya proyek disetujui", message: `${expense.number} telah disetujui.`, link: `/projects/${expense.projectId}` }
    ).catch((err) => console.error("[approveExpense] dispatchOutbound failed:", err));
  }

  return expense;
}

export async function rejectExpense(id: string, reason: string, actor: SessionPayload) {
  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectExpense.findUniqueOrThrow({ where: { id } });
    requireExpenseApprover(actor.role, actor.userId, existing.submittedById);
    const updated = await tx.projectExpense.update({
      where: { id },
      data: { approvalStatus: "REJECTED", isLocked: false, rejectedAt: new Date(), rejectedById: actor.userId, rejectionReason: reason },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "REJECT", entityType: "PROJECT_EXPENSE", entityId: id,
      description: `${updated.number}: Rejected - ${reason}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "EXPENSE_REJECTED",
        title: "Project expense rejected",
        message: `${updated.number} was rejected: ${reason}`,
        link: `/projects/${updated.projectId}`,
      });
    }
    return updated;
  });

  if (expense.submittedById) {
    await dispatchOutbound(
      { userId: expense.submittedById },
      { title: "Biaya proyek ditolak", message: `${expense.number} ditolak: ${reason}`, link: `/projects/${expense.projectId}` }
    ).catch((err) => console.error("[rejectExpense] dispatchOutbound failed:", err));
  }

  return expense;
}

/**
 * APPROVED -> paymentStatus PAID, gated on an uploaded proof-of-payment file
 * (kwitansi/bukti transfer) — same "evidence before the system treats
 * something as done" rule as recordPayment's bukti transfer requirement on
 * Invoice. Until now paymentStatus could be set straight to PAID from the
 * create form with nothing behind it. Also requires the expense to already
 * be APPROVED, so Finance can't pay out something Direktur never signed off.
 */
export async function markExpensePaid(id: string, documentId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.projectExpense.findUniqueOrThrow({ where: { id } });
    if (existing.approvalStatus !== "APPROVED") {
      throw new Error("Only an approved expense can be marked as paid.");
    }
    if (existing.paymentStatus === "PAID") {
      throw new Error("This expense is already marked as paid.");
    }
    const updated = await tx.projectExpense.update({ where: { id }, data: { paymentStatus: "PAID" } });
    await tx.document.update({ where: { id: documentId }, data: { relatedEntityId: id } });
    await logActivity(tx, {
      userId: actor.userId, action: "PAYMENT", entityType: "PROJECT_EXPENSE", entityId: id,
      description: `${updated.number}: Marked as paid by ${actor.name}, bukti bayar terlampir`,
      metadata: { documentId },
    });
    return updated;
  });
}
