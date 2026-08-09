"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getSalesReport() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "reports", "view");

  const quotations = await prisma.quotation.findMany({
    where: { deletedAt: null },
    include: { salesPic: { select: { name: true } }, customer: { select: { companyName: true } } },
  });

  const totalOpportunities = await prisma.opportunity.count({ where: { deletedAt: null } });
  const won = quotations.filter((q) => q.status === "WON");
  const lost = quotations.filter((q) => q.status === "LOST");
  const wonValue = won.reduce((s, q) => s + Number(q.grandTotal), 0);
  const lostValue = lost.reduce((s, q) => s + Number(q.grandTotal), 0);
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;

  const byMonth = new Map<string, number>();
  for (const q of quotations) {
    const key = monthKey(new Date(q.quotationDate));
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(q.grandTotal));
  }
  const monthlySales = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));

  const bySalesPic = new Map<string, number>();
  for (const q of won) {
    const key = q.salesPic.name;
    bySalesPic.set(key, (bySalesPic.get(key) ?? 0) + Number(q.grandTotal));
  }
  const revenueBySalesPic = Array.from(bySalesPic.entries()).map(([name, value]) => ({ name, value }));

  const byCustomer = new Map<string, number>();
  for (const q of won) {
    const key = q.customer.companyName;
    byCustomer.set(key, (byCustomer.get(key) ?? 0) + Number(q.grandTotal));
  }
  const revenueByCustomer = Array.from(byCustomer.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

  return {
    totalOpportunities,
    totalQuotationValue: quotations.reduce((s, q) => s + Number(q.grandTotal), 0),
    wonValue, lostValue, winRate,
    monthlySales, revenueBySalesPic, revenueByCustomer,
  };
}

export async function getFinanceReport() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "reports", "view");

  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({ where: { deletedAt: null } }),
    prisma.projectExpense.findMany({ where: { deletedAt: null } }),
  ]);

  const revenue = invoices.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + Number(i.grandTotal), 0);
  const paid = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
  const outstanding = revenue - paid;
  const overdue = invoices.filter((i) => i.status === "OVERDUE").reduce((s, i) => s + (Number(i.grandTotal) - Number(i.paidAmount)), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.total), 0);
  const grossProfit = revenue - totalExpenses;

  const byMonth = new Map<string, { revenue: number; expense: number }>();
  for (const i of invoices) {
    const key = monthKey(new Date(i.invoiceDate));
    const row = byMonth.get(key) ?? { revenue: 0, expense: 0 };
    row.revenue += Number(i.grandTotal);
    byMonth.set(key, row);
  }
  for (const e of expenses) {
    const key = monthKey(new Date(e.date));
    const row = byMonth.get(key) ?? { revenue: 0, expense: 0 };
    row.expense += Number(e.total);
    byMonth.set(key, row);
  }
  const monthly = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

  return { revenue, paid, outstanding, overdue, totalExpenses, grossProfit, monthly };
}

export async function getProjectReport() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "reports", "view");

  const projects = await prisma.project.findMany({ where: { deletedAt: null } });
  const byStatus = new Map<string, number>();
  for (const p of projects) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);

  const delayed = projects.filter((p) => p.endDate && new Date(p.endDate) < new Date() && !["COMPLETED", "CLOSED", "CANCELLED"].includes(p.status));

  return {
    total: projects.length,
    active: projects.filter((p) => p.status === "ACTIVE").length,
    completed: projects.filter((p) => ["COMPLETED", "CLOSED"].includes(p.status)).length,
    atRisk: projects.filter((p) => p.status === "AT_RISK").length,
    delayed: delayed.length,
    statusBreakdown: Array.from(byStatus.entries()).map(([name, value]) => ({ name, value })),
    avgProgress: projects.length ? Math.round(projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length) : 0,
  };
}

export async function getProfitabilityReport() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "reports", "view");

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, expenses: { where: { deletedAt: null } } },
  });

  const rows = projects.map((p) => {
    const cost = p.expenses.reduce((s, e) => s + Number(e.total), 0);
    const revenue = Number(p.contractValue);
    const grossProfit = revenue - cost;
    const grossMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
    return { id: p.id, number: p.number, customer: p.customer.companyName, revenue, cost, grossProfit, grossMargin };
  });

  return rows.sort((a, b) => b.grossProfit - a.grossProfit);
}

export async function getExecutiveReport() {
  const [sales, finance, project] = await Promise.all([getSalesReport(), getFinanceReport(), getProjectReport()]);
  return { sales, finance, project };
}
