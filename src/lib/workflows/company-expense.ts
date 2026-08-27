import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole, notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { requireCompanyExpenseApprover } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// MAKER-CHECKER for CompanyExpense — same pattern as ProjectExpense (see
// expense.ts), applied to company-wide operating costs (salaries, office
// rent, utilities) instead of per-project ones. createCompanyExpense() lives
// in server/finance/company-expenses.ts; this file only adds the
// submit -> approve/reject lifecycle on top.
// ---------------------------------------------------------------------------

export async function submitCompanyExpenseForApproval(id: string, actor: SessionPayload) {
  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.companyExpense.findUniqueOrThrow({ where: { id } });
    if (existing.approvalStatus !== "DRAFT") {
      throw new Error("Only a draft company expense can be submitted for approval.");
    }
    const updated = await tx.companyExpense.update({
      where: { id },
      data: { approvalStatus: "SUBMITTED", submittedAt: new Date(), submittedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "COMPANY_EXPENSE", entityId: id,
      description: `${updated.number}: Draft -> Submitted for approval`,
    });
    await notifyRole(tx, "ADMIN", {
      type: "COMPANY_EXPENSE_APPROVAL",
      title: "Beban operasional menunggu approval",
      message: `${updated.number} (Rp ${Number(updated.total).toLocaleString("id-ID")}) diajukan oleh ${actor.name} dan menunggu approval Anda.`,
      link: "/finance/company-expenses",
    });
    return updated;
  });

  await dispatchOutbound(
    { role: "ADMIN" },
    {
      title: "Beban operasional menunggu approval",
      message: `${expense.number} (Rp ${Number(expense.total).toLocaleString("id-ID")}) diajukan oleh ${actor.name} dan menunggu approval Anda.`,
      link: "/finance/company-expenses",
    }
  ).catch((err) => console.error("[submitCompanyExpenseForApproval] dispatchOutbound failed:", err));

  return expense;
}

export async function approveCompanyExpense(id: string, actor: SessionPayload) {
  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.companyExpense.findUniqueOrThrow({ where: { id } });
    requireCompanyExpenseApprover(actor.role, actor.userId, existing.submittedById);
    if (existing.approvalStatus !== "SUBMITTED") {
      throw new Error("Only a submitted company expense can be approved.");
    }
    const updated = await tx.companyExpense.update({
      where: { id },
      data: { approvalStatus: "APPROVED", approvedAt: new Date(), approvedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "APPROVE", entityType: "COMPANY_EXPENSE", entityId: id,
      description: `${updated.number}: Approved by ${actor.name}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "COMPANY_EXPENSE_APPROVED",
        title: "Beban operasional disetujui",
        message: `${updated.number} telah disetujui.`,
        link: "/finance/company-expenses",
      });
    }
    return updated;
  });

  if (expense.submittedById) {
    await dispatchOutbound(
      { userId: expense.submittedById },
      { title: "Beban operasional disetujui", message: `${expense.number} telah disetujui.`, link: "/finance/company-expenses" }
    ).catch((err) => console.error("[approveCompanyExpense] dispatchOutbound failed:", err));
  }

  return expense;
}

export async function rejectCompanyExpense(id: string, reason: string, actor: SessionPayload) {
  const expense = await prisma.$transaction(async (tx) => {
    const existing = await tx.companyExpense.findUniqueOrThrow({ where: { id } });
    requireCompanyExpenseApprover(actor.role, actor.userId, existing.submittedById);
    const updated = await tx.companyExpense.update({
      where: { id },
      data: { approvalStatus: "REJECTED", rejectedAt: new Date(), rejectedById: actor.userId, rejectionReason: reason },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "REJECT", entityType: "COMPANY_EXPENSE", entityId: id,
      description: `${updated.number}: Rejected - ${reason}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "COMPANY_EXPENSE_REJECTED",
        title: "Beban operasional ditolak",
        message: `${updated.number} ditolak: ${reason}`,
        link: "/finance/company-expenses",
      });
    }
    return updated;
  });

  if (expense.submittedById) {
    await dispatchOutbound(
      { userId: expense.submittedById },
      { title: "Beban operasional ditolak", message: `${expense.number} ditolak: ${reason}`, link: "/finance/company-expenses" }
    ).catch((err) => console.error("[rejectCompanyExpense] dispatchOutbound failed:", err));
  }

  return expense;
}

/** APPROVED -> paymentStatus PAID. Same simple flag as ProjectExpense today. */
export async function markCompanyExpensePaid(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.companyExpense.findUniqueOrThrow({ where: { id } });
    if (existing.approvalStatus !== "APPROVED") {
      throw new Error("Only an approved company expense can be marked as paid.");
    }
    if (existing.paymentStatus === "PAID") {
      throw new Error("This company expense is already marked as paid.");
    }
    const updated = await tx.companyExpense.update({ where: { id }, data: { paymentStatus: "PAID" } });
    await logActivity(tx, {
      userId: actor.userId, action: "PAYMENT", entityType: "COMPANY_EXPENSE", entityId: id,
      description: `${updated.number}: Marked as paid by ${actor.name}`,
    });
    return updated;
  });
}
