"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { refreshOverdueInvoices } from "@/lib/workflows/finance";
import { invoiceDueAmount, computeSCurve, round2 } from "@/lib/workflows/calculations";
import { getBillingSchedule } from "@/server/finance/billing-schedule";

/** Powers both the home dashboard KPI cards and the alert widgets (sections 29 & 36). */
export async function getDashboardData() {
  await requireUserOrThrow();
  await refreshOverdueInvoices();

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    revenueInvoices, receivableInvoices, activeProjects, atRiskProjects, completedProjects,
    overdueInvoices, quotationsAwaitingApproval, expiringContracts, projectsClosingIncomplete,
    billingSchedule, progressProjects, pipelineByStage, wonLostQuotations,
  ] = await Promise.all([
    // Fetched (not aggregated) because "revenue" for a staged DP invoice is
    // grandTotal * dpPercent/100, not grandTotal — a per-row calculation
    // Prisma's _sum can't express. See invoiceDueAmount().
    prisma.invoice.findMany({ where: { deletedAt: null, status: { not: "CANCELLED" } }, select: { grandTotal: true, dpPercent: true } }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { grandTotal: true, dpPercent: true, paidAmount: true, withholdingTax: true },
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
    // "Belum ditagih, dan kapan" — the same computeBillingSchedule roll-up
    // now shown on Receivables/Invoices/Payments, surfaced here too so a
    // director sees it without opening Finance at all.
    getBillingSchedule(),
    // Real project-progress data (Aug 2026) — planned/actual/billed % as of
    // today, the same numbers each project's own S-Curve tab shows, rolled
    // up here so "kemajuan project" is visible company-wide without opening
    // every project one at a time. Needs real Milestones to mean anything
    // (see backfill-milestones.ts) — a project with none just shows 0%,
    // which is honest: no plan has been entered for it yet, not a bug.
    prisma.project.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "AT_RISK"] } },
      select: {
        id: true, number: true, contractValue: true,
        customer: { select: { companyName: true } },
        milestones: { select: { dueDate: true, weightPercent: true, completedAt: true } },
        invoices: { where: { deletedAt: null }, select: { invoiceDate: true, grandTotal: true, dpPercent: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Sales pipeline — pre-Won/Lost stage counts + committed value, for the
    // "Pipeline Prospek" card. Grouped here rather than via getSalesReport()
    // since that requires the separate "reports" permission SALES/FINANCE/PM
    // don't all have; this is company-wide pipeline health, same visibility
    // rule as the rest of this dashboard's kpis.
    prisma.opportunity.groupBy({
      by: ["status"],
      where: { deletedAt: null, status: { notIn: ["WON", "LOST"] } },
      _count: { _all: true },
      _sum: { estimatedValue: true },
    }),
    prisma.quotation.findMany({
      where: { deletedAt: null, status: { in: ["WON", "LOST"] } },
      select: { status: true },
    }),
  ]);

  const projectProgress = progressProjects.map((p) => {
    const sCurve = computeSCurve({
      milestones: p.milestones.map((m) => ({ dueDate: m.dueDate, weightPercent: Number(m.weightPercent), completedAt: m.completedAt })),
      invoices: p.invoices.map((i) => ({
        invoiceDate: i.invoiceDate, grandTotal: Number(i.grandTotal),
        dpPercent: i.dpPercent != null ? Number(i.dpPercent) : null, status: i.status,
      })),
      contractValue: Number(p.contractValue),
    });
    return {
      projectId: p.id,
      projectNumber: p.number,
      customerName: p.customer.companyName,
      planned: sCurve.asOfToday.planned,
      actual: sCurve.asOfToday.actual,
      billed: sCurve.asOfToday.billed,
      // Positive = ahead of schedule, negative = behind — the single number
      // that answers "is this project on track" without reading a chart.
      scheduleGap: round2(sCurve.asOfToday.actual - sCurve.asOfToday.planned),
    };
  });

  const totalRevenue = revenueInvoices.reduce((s, i) => s + invoiceDueAmount(i), 0);
  const totalReceivableInvoiced = receivableInvoices.reduce((s, i) => s + invoiceDueAmount(i), 0);
  const totalReceivablePaid = receivableInvoices.reduce((s, i) => s + Number(i.paidAmount), 0);
  // Tax the customer legally withheld settles the invoice like cash does —
  // see invoiceOutstanding().
  const totalReceivableWithheld = receivableInvoices.reduce((s, i) => s + Number(i.withholdingTax), 0);
  const outstandingReceivables = totalReceivableInvoiced - totalReceivablePaid - totalReceivableWithheld;

  const expenseAgg = await prisma.projectExpense.aggregate({ where: { deletedAt: null }, _sum: { total: true } });
  const grossProfit = totalRevenue - Number(expenseAgg._sum.total ?? 0);

  const pipelineStageOrder = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const;
  const pipelineByStageMap = new Map(pipelineByStage.map((row) => [row.status, row]));
  const salesPipeline = {
    stages: pipelineStageOrder.map((status) => ({
      status,
      count: pipelineByStageMap.get(status)?._count._all ?? 0,
    })),
    totalValue: pipelineByStage.reduce((s, row) => s + Number(row._sum.estimatedValue ?? 0), 0),
    winRate: wonLostQuotations.length > 0
      ? Math.round((wonLostQuotations.filter((q) => q.status === "WON").length / wonLostQuotations.length) * 100)
      : null,
  };

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
      billingDueSoon: billingSchedule.filter((r) => {
        if (!r.nextBillingDate) return false;
        const days = (r.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        return days <= 7;
      }),
    },
    billingSchedule,
    projectProgress,
    salesPipeline,
  };
}
