"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { refreshOverdueInvoices } from "@/lib/workflows/finance";
import { invoiceDueAmount } from "@/lib/workflows/calculations";

/** Powers both the home dashboard KPI cards and the alert widgets (sections 29 & 36). */
export async function getDashboardData() {
  await requireUserOrThrow();
  await refreshOverdueInvoices();

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    revenueInvoices, receivableInvoices, activeProjects, atRiskProjects, completedProjects,
    overdueInvoices, quotationsAwaitingApproval, expiringContracts, projectsClosingIncomplete,
  ] = await Promise.all([
    // Fetched (not aggregated) because "revenue" for a staged DP invoice is
    // grandTotal * dpPercent/100, not grandTotal — a per-row calculation
    // Prisma's _sum can't express. See invoiceDueAmount().
    prisma.invoice.findMany({ where: { deletedAt: null, status: { not: "CANCELLED" } }, select: { grandTotal: true, dpPercent: true } }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { grandTotal: true, dpPercent: true, paidAmount: true },
    }),
    prisma.project.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.project.count({ where: { deletedAt: null, status: "AT_RISK" } }),
    prisma.project.count({ where: { deletedAt: null, status: { in: ["COMPLETED", "CLOSED"] } } }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: "OVERDUE" },
      select: { id: true, number: true, dueDate: true, customer: { select: { companyName: true } } },
      take: 5,
    }),
    prisma.quotation.findMany({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, deletedAt: null },
      select: { id: true, number: true },
      take: 5,
    }),
    prisma.contract.findMany({
      where: { status: "ACTIVE", endDate: { lte: in30Days }, deletedAt: null },
      select: { id: true, number: true, endDate: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "AT_RISK"] } },
      select: { id: true, number: true },
      take: 20,
    }),
  ]);

  const totalRevenue = revenueInvoices.reduce((s, i) => s + invoiceDueAmount(i), 0);
  const totalReceivableInvoiced = receivableInvoices.reduce((s, i) => s + invoiceDueAmount(i), 0);
  const totalReceivablePaid = receivableInvoices.reduce((s, i) => s + Number(i.paidAmount), 0);
  const outstandingReceivables = totalReceivableInvoiced - totalReceivablePaid;

  const expenseAgg = await prisma.projectExpense.aggregate({ where: { deletedAt: null }, _sum: { total: true } });
  const grossProfit = totalRevenue - Number(expenseAgg._sum.total ?? 0);

  return {
    kpis: {
      totalRevenue,
      outstandingReceivables,
      activeProjects,
      atRiskProjects,
      completedProjects,
      grossProfit,
    },
    alerts: {
      overdueInvoices,
      quotationsAwaitingApproval,
      expiringContracts,
      projectsAtRiskCount: atRiskProjects,
    },
  };
}
