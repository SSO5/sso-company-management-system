"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { refreshOverdueInvoices } from "@/lib/workflows/finance";

export async function getReceivables() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  await refreshOverdueInvoices();

  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"] } },
    include: { customer: { select: { companyName: true } } },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  return invoices.map((inv) => {
    const outstanding = Number(inv.grandTotal) - Number(inv.paidAmount);
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)));
    let indicator: "not_due" | "due_soon" | "overdue" | "paid" = "not_due";
    if (inv.status === "PAID") indicator = "paid";
    else if (inv.status === "OVERDUE") indicator = "overdue";
    else {
      const daysUntilDue = Math.floor((new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      indicator = daysUntilDue <= 7 ? "due_soon" : "not_due";
    }
    return { ...inv, outstanding, daysOverdue, indicator };
  });
}

export async function listProjectExpenses() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  return prisma.projectExpense.findMany({
    where: { deletedAt: null },
    include: { project: { select: { number: true, name: true } }, createdBy: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
}
