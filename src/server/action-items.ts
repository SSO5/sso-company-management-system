"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Cross-divisional "to-do list per jobdes" (spec, Aug 2026): instead of a
 * manually-maintained task list, this computes each user's outstanding
 * action items live from the data that already exists across Sales,
 * Finance, and Project — maker-checker approvals waiting on them,
 * receivables about to go overdue, quotations that need follow-up, project
 * milestones/checkpoints slipping. "Input once, reuse everywhere": nothing
 * here is a new record a human has to remember to create — it is entirely
 * derived from Quotation/VendorPurchaseOrder/ProjectExpense/Invoice/
 * ProjectMilestone/ProgressReport state that other modules already own.
 *
 * Scoping rule: ADMIN (Faldy/Sulton/Aldo today) sees the company-wide queue
 * for every module they can act on. SALES/FINANCE/PROJECT_MANAGER only see
 * items tied to their own deals/projects. VIEWER (non-executive Director)
 * gets nothing here — by design, VIEWER cannot approve/edit anything, so an
 * action queue would just be noise; they read the Dashboard KPIs/reports
 * instead.
 */

export type ActionItemSeverity = "overdue" | "due_soon" | "pending_approval" | "attention";
export type ActionItemModule = "sales" | "finance" | "project" | "procurement";

export interface ActionItem {
  id: string;
  module: ActionItemModule;
  severity: ActionItemSeverity;
  title: string;
  subtitle: string;
  href: string;
  dueDate: Date | null;
}

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

export async function getMyActionItems(): Promise<ActionItem[]> {
  const actor = await requireUserOrThrow();
  if (actor.role === "VIEWER") return [];

  const items: ActionItem[] = [];
  const now = new Date();
  const soon = new Date(now.getTime() + DAYS_7);
  const isApprover = actor.role === "ADMIN";
  const seesFinance = actor.role === "ADMIN" || actor.role === "FINANCE";
  const seesSales = actor.role === "ADMIN" || actor.role === "SALES";
  const seesProjects = actor.role === "ADMIN" || actor.role === "PROJECT_MANAGER";

  const [
    quotationApprovals, vendorPoApprovals, expenseApprovals, invoiceApprovals,
    overdueInvoices, dueSoonInvoices, staleQuotations,
    overdueMilestones, openProgressReports, unassignedProjects,
  ] = await Promise.all([
    isApprover
      ? prisma.quotation.findMany({
          where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, deletedAt: null, submittedById: { not: actor.userId } },
          select: { id: true, number: true, grandTotal: true, customer: { select: { companyName: true } } },
        })
      : Promise.resolve([]),
    isApprover
      ? prisma.vendorPurchaseOrder.findMany({
          where: { status: "SUBMITTED", deletedAt: null, submittedById: { not: actor.userId } },
          select: { id: true, number: true, grandTotal: true, vendorName: true },
        })
      : Promise.resolve([]),
    isApprover
      ? prisma.projectExpense.findMany({
          where: { approvalStatus: "SUBMITTED", deletedAt: null, submittedById: { not: actor.userId } },
          select: { id: true, number: true, total: true, description: true, project: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    isApprover
      ? prisma.invoice.findMany({
          where: { status: "SUBMITTED", deletedAt: null, submittedById: { not: actor.userId } },
          select: { id: true, number: true, grandTotal: true, customer: { select: { companyName: true } } },
        })
      : Promise.resolve([]),
    seesFinance
      ? prisma.invoice.findMany({
          where: { deletedAt: null, status: "OVERDUE" },
          select: { id: true, number: true, dueDate: true, grandTotal: true, customer: { select: { companyName: true } } },
        })
      : Promise.resolve([]),
    seesFinance
      ? prisma.invoice.findMany({
          where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { gte: now, lte: soon } },
          select: { id: true, number: true, dueDate: true, grandTotal: true, customer: { select: { companyName: true } } },
        })
      : Promise.resolve([]),
    seesSales
      ? prisma.quotation.findMany({
          where: {
            deletedAt: null,
            status: "SENT",
            validUntil: { lte: soon },
            ...(actor.role === "SALES" ? { salesPicId: actor.userId } : {}),
          },
          select: { id: true, number: true, validUntil: true, customer: { select: { companyName: true } } },
        })
      : Promise.resolve([]),
    seesProjects
      ? prisma.projectMilestone.findMany({
          where: {
            status: { not: "COMPLETED" },
            dueDate: { lt: now },
            project: { deletedAt: null, ...(actor.role === "PROJECT_MANAGER" ? { projectManagerId: actor.userId } : {}) },
          },
          select: { id: true, name: true, dueDate: true, project: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    seesProjects
      ? prisma.progressReport.findMany({
          where: {
            deletedAt: null,
            items: { some: { isDone: false } },
            project: { deletedAt: null, ...(actor.role === "PROJECT_MANAGER" ? { projectManagerId: actor.userId } : {}) },
          },
          select: {
            id: true, number: true, inspectionDate: true,
            project: { select: { id: true, name: true } },
            items: { select: { isDone: true } },
          },
        })
      : Promise.resolve([]),
    actor.role === "ADMIN"
      ? prisma.project.findMany({
          where: { deletedAt: null, status: { in: ["PLANNING", "ACTIVE"] }, projectManagerId: null },
          select: { id: true, number: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  for (const q of quotationApprovals) {
    items.push({
      id: `quo-approve-${q.id}`, module: "sales", severity: "pending_approval",
      title: `Approve Quotation ${q.number}`, subtitle: q.customer.companyName,
      href: `/sales/quotations/${q.id}`, dueDate: null,
    });
  }
  for (const po of vendorPoApprovals) {
    items.push({
      id: `vpo-approve-${po.id}`, module: "procurement", severity: "pending_approval",
      title: `Approve Vendor PO ${po.number}`, subtitle: po.vendorName,
      href: `/procurement/vendor-po/${po.id}`, dueDate: null,
    });
  }
  for (const ex of expenseApprovals) {
    items.push({
      id: `exp-approve-${ex.id}`, module: "finance", severity: "pending_approval",
      title: `Approve Expense ${ex.number}`, subtitle: `${ex.project.name} — ${ex.description}`,
      href: `/projects/${ex.project.id}?tab=costs`, dueDate: null,
    });
  }
  for (const inv of invoiceApprovals) {
    items.push({
      id: `inv-approve-${inv.id}`, module: "finance", severity: "pending_approval",
      title: `Approve Invoice ${inv.number}`, subtitle: inv.customer.companyName,
      href: `/finance/invoices/${inv.id}`, dueDate: null,
    });
  }
  for (const inv of overdueInvoices) {
    items.push({
      id: `inv-overdue-${inv.id}`, module: "finance", severity: "overdue",
      title: `Invoice ${inv.number} overdue`, subtitle: inv.customer.companyName,
      href: `/finance/invoices/${inv.id}`, dueDate: inv.dueDate,
    });
  }
  for (const inv of dueSoonInvoices) {
    items.push({
      id: `inv-duesoon-${inv.id}`, module: "finance", severity: "due_soon",
      title: `Invoice ${inv.number} due soon`, subtitle: inv.customer.companyName,
      href: `/finance/invoices/${inv.id}`, dueDate: inv.dueDate,
    });
  }
  for (const q of staleQuotations) {
    const overdue = q.validUntil && q.validUntil < now;
    items.push({
      id: `quo-followup-${q.id}`, module: "sales", severity: overdue ? "overdue" : "due_soon",
      title: overdue ? `Quotation ${q.number} expired — follow up` : `Quotation ${q.number} expiring — follow up`,
      subtitle: q.customer.companyName, href: `/sales/quotations/${q.id}`, dueDate: q.validUntil,
    });
  }
  for (const m of overdueMilestones) {
    items.push({
      id: `mile-overdue-${m.id}`, module: "project", severity: "overdue",
      title: `Milestone "${m.name}" overdue`, subtitle: m.project.name,
      href: `/projects/${m.project.id}`, dueDate: m.dueDate,
    });
  }
  for (const r of openProgressReports) {
    const open = r.items.filter((i) => !i.isDone).length;
    items.push({
      id: `progrep-open-${r.id}`, module: "project", severity: "attention",
      title: `${open} checkpoint${open > 1 ? "s" : ""} belum selesai — ${r.number}`,
      subtitle: r.project.name, href: `/projects/${r.project.id}?tab=progress`, dueDate: null,
    });
  }
  for (const p of unassignedProjects) {
    items.push({
      id: `proj-nopm-${p.id}`, module: "project", severity: "attention",
      title: `Project ${p.number} belum ada PM`, subtitle: p.name,
      href: `/projects/${p.id}`, dueDate: null,
    });
  }

  const severityOrder: Record<ActionItemSeverity, number> = { overdue: 0, pending_approval: 1, due_soon: 2, attention: 3 };
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return items;
}

/** Small helper for a per-role "who does this belong to" label in the UI. */
export function actionItemModuleLabel(m: ActionItemModule): string {
  return { sales: "Sales", finance: "Finance", project: "Project", procurement: "Procurement" }[m];
}
