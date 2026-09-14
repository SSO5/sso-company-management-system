"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { ISSUED_INVOICE_STATUSES } from "@/lib/workspace";
import {
  invoiceDueAmount,
  invoiceOutstanding,
  computeSCurve,
  computeProjectRiskSignals,
  round2,
} from "@/lib/workflows/calculations";

/** Read-only home summary. No reminders, status writes, or historical reports on the hot path. */
export async function getDashboardData() {
  const actor = await requireUserOrThrow();
  const seesFinance = ["ADMIN", "FINANCE", "VIEWER"].includes(actor.role);
  const [invoices, projects, pipeline, bankRows, projectExpenses, companyExpenses, financeWork] = await Promise.all([
    prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: [...ISSUED_INVOICE_STATUSES] } },
      select: {
        grandTotal: true,
        dpPercent: true,
        paidAmount: true,
        withholdingTax: true,
        status: true,
      },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "AT_RISK"] } },
      select: {
        id: true,
        number: true,
        status: true,
        budget: true,
        contractValue: true,
        customer: { select: { companyName: true } },
        milestones: {
          select: {
            name: true,
            status: true,
            dueDate: true,
            weightPercent: true,
            completedAt: true,
          },
        },
        expenses: {
          where: { deletedAt: null, approvalStatus: "APPROVED" },
          select: { total: true },
        },
        invoices: {
          where: { deletedAt: null },
          select: {
            invoiceDate: true,
            grandTotal: true,
            dpPercent: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.opportunity.groupBy({
      by: ["status"],
      where: {
        deletedAt: null,
        status: { notIn: ["WON", "LOST"] },
        ...(actor.role === "SALES" ? { salesPicId: actor.userId } : {}),
      },
      _count: { _all: true },
      _sum: { estimatedValue: true },
    }),
    seesFinance
      ? prisma.financeBankBalance.findMany({ orderBy: [{ asOf: "desc" }, { createdAt: "desc" }] })
      : Promise.resolve([]),
    seesFinance
      ? prisma.projectExpense.findMany({
          where: { deletedAt: null, approvalStatus: "APPROVED", paymentStatus: "UNPAID" },
          select: { total: true },
        })
      : Promise.resolve([]),
    seesFinance
      ? prisma.companyExpense.findMany({
          where: { deletedAt: null, approvalStatus: "APPROVED", paymentStatus: "UNPAID" },
          select: { total: true },
        })
      : Promise.resolve([]),
    seesFinance
      ? prisma.financeWorkItem.count({ where: { status: { not: "DONE" } } })
      : Promise.resolve(0),
  ]);
  const latestBankRows = [...bankRows]
    .sort((a, b) => b.asOf.getTime() - a.asOf.getTime())
    .filter((row, index, rows) => rows.findIndex((candidate) => candidate.bankName === row.bankName) === index);
  const projectProgress = projects.map((p) => {
    const curve = computeSCurve({
      contractValue: Number(p.contractValue),
      milestones: p.milestones.map((m) => ({
        ...m,
        weightPercent: Number(m.weightPercent),
      })),
      invoices: p.invoices.map((i) => ({
        ...i,
        grandTotal: Number(i.grandTotal),
        dpPercent: i.dpPercent == null ? null : Number(i.dpPercent),
      })),
    });
    const risk = computeProjectRiskSignals({
      status: p.status,
      milestones: p.milestones,
      budget: Number(p.budget),
      approvedExpenseTotal: p.expenses.reduce((s, e) => s + Number(e.total), 0),
      sCurveAsOfToday: curve.asOfToday,
    });
    return {
      projectId: p.id,
      projectNumber: p.number,
      customerName: p.customer.companyName,
      atRisk: p.status === "AT_RISK" || risk.length > 0,
      hasPlan: p.milestones.some(m => Number(m.weightPercent) > 0),
      planned: curve.asOfToday.planned,
      actual: curve.asOfToday.actual,
      billed: curve.asOfToday.billed,
      scheduleGap: round2(curve.asOfToday.actual - curve.asOfToday.planned),
    };
  });
  const order = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const;
  return {
    kpis: {
      totalRevenue: invoices.reduce((s, i) => s + invoiceDueAmount(i), 0),
      outstandingReceivables: invoices
        .filter((i) => i.status !== "PAID")
        .reduce((s, i) => s + Math.max(0, invoiceOutstanding(i)), 0),
      activeProjects: projects.length,
      atRiskProjects: projectProgress.filter((p) => p.atRisk).length,
      latestCashBalance: latestBankRows.reduce((sum, row) => sum + Number(row.amount), 0),
      cashAsOf: latestBankRows[0]?.asOf ?? null,
      approvedUnpaidCosts: [...projectExpenses, ...companyExpenses].reduce((sum, row) => sum + Number(row.total), 0),
      openFinanceWork: financeWork,
    },
    projectProgress,
    salesPipeline: {
      stages: order.map((status) => ({
        status,
        count: pipeline.find((p) => p.status === status)?._count._all ?? 0,
      })),
      totalValue: pipeline.reduce(
        (s, p) => s + Number(p._sum.estimatedValue ?? 0),
        0,
      ),
    },
  };
}
