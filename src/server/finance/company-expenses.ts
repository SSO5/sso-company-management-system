"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { companyExpenseSchema } from "@/lib/validation/finance";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import {
  submitCompanyExpenseForApproval,
  approveCompanyExpense,
  rejectCompanyExpense,
  markCompanyExpensePaid,
} from "@/lib/workflows/company-expense";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { revalidatePath } from "next/cache";

/**
 * Company-wide operating expenses (salaries, office rent, utilities) — the
 * gap ProjectExpense can't cover since its projectId is required. Same
 * "finance" module grant and maker-checker approval as every other Finance
 * document; see lib/workflows/company-expense.ts for the approval lifecycle.
 */
export async function listCompanyExpenses() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  return prisma.companyExpense.findMany({
    where: { deletedAt: null },
    include: { account: { select: { code: true, name: true } }, createdBy: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
}

export async function createCompanyExpenseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "create");
    const data = companyExpenseSchema.parse(input);
    const total = data.amount + data.tax;

    const expense = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "COMPANY_EXPENSE");
      const created = await tx.companyExpense.create({
        data: { ...data, total, number, createdById: actor.userId },
      });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "COMPANY_EXPENSE", entityId: created.id,
        description: `Beban operasional dicatat: ${created.number} - ${created.description}`,
      });
      return created;
    });

    revalidatePath("/finance/company-expenses");
    return { id: expense.id };
  });
}

export async function submitCompanyExpenseAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "update");
    await submitCompanyExpenseForApproval(id, actor);
    revalidatePath("/finance/company-expenses");
    return { id };
  });
}

export async function approveCompanyExpenseAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await approveCompanyExpense(id, actor);
    revalidatePath("/finance/company-expenses");
    return { id };
  });
}

export async function rejectCompanyExpenseAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await rejectCompanyExpense(id, reason, actor);
    revalidatePath("/finance/company-expenses");
    return { id };
  });
}

export async function markCompanyExpensePaidAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "update");
    await markCompanyExpensePaid(id, actor);
    revalidatePath("/finance/company-expenses");
    return { id };
  });
}
