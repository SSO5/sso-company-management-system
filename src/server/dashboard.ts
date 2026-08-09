"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { refreshOverdueInvoices } from "@/lib/workflows/finance";

/** Powers both the home dashboard KPI cards and the alert widgets (sections 29 & 36). */
export async function getDashboardData() {
  await requireUserOrThrow();
  await refreshOverdueInvoices();

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    revenueAgg, receivablesAgg, activeProjects, atRiskProjects, completedProjects,
    overdueInvoices, quotationsAwaitingApproval, expiringContracts, projectsClosingIncomplete,
  ] = await Promise.all([
    prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: "CANCELLED" } }, _sum: { grandTotal: true } }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { grandTotal: true, paidAmount: true },
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

  const totalRevenue = Number(revenueAgg._sum.grandTotal ?? 0);
  const totalReceivableInvoiced = Number(receivablesAgg._sum.grandTotal ?? 0);
  const totalReceivablePaid = Number(receivablesAgg._sum.paidAmount ?? 0);
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
