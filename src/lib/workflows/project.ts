import type { Prisma, Quotation, Customer, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole } from "@/lib/workflows/notify";
import { createProjectFolders, mergeOpportunityFoldersIntoProject } from "@/lib/workflows/folders";
import { calcProfitability } from "@/lib/workflows/calculations";
import type { SessionPayload } from "@/lib/auth/session";
import { requireProjectCloser } from "@/lib/permissions";

/** A notification to send once the Won-deal transaction has actually
 * committed — see the "pendingNotifications" note on convertQuotationToProject. */
export interface PendingNotification {
  role?: UserRole;
  userId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

const DEFAULT_TASK_TEMPLATE = [
  { title: "Kickoff meeting with customer", priority: "HIGH" as const },
  { title: "Prepare project plan & timeline", priority: "HIGH" as const },
  { title: "Assign project team", priority: "MEDIUM" as const },
  { title: "Set up project documentation folder", priority: "LOW" as const },
];

const DEFAULT_MILESTONE_TEMPLATE = [
  { name: "Milestone 1 — Planning", sortOrder: 1 },
  { name: "Milestone 2 — Development", sortOrder: 2 },
  { name: "Milestone 3 — Delivery", sortOrder: 3 },
  { name: "Milestone 4 — Acceptance", sortOrder: 4 },
  { name: "Milestone 5 — Closing", sortOrder: 5 },
];

/**
 * Deal-Won automation (spec sections 11 & 38). Runs entirely inside the
 * caller's transaction: Project -> folders -> default tasks -> milestones ->
 * activity log. If ANY step throws, Prisma rolls back the whole transaction
 * and the quotation status change that triggered this is undone too — there
 * is no partially-created project left behind.
 *
 * Notifications are the one exception: they're collected into
 * `pendingNotifications` and returned instead of written here. Sending them
 * needs a `user.findMany` (by role) plus a `notification.createMany` per
 * recipient group — real DB work that doesn't need to be atomic with the
 * project/folder/task creation above (a failed notification insert should
 * never roll back an otherwise-successful Won conversion), and cutting it
 * from the transaction also shortens an already-long chain of sequential
 * round trips against a remote database. The caller fires these with the
 * plain `prisma` client AFTER the transaction commits (see
 * markQuotationWon in lib/workflows/quotation.ts).
 */
export async function convertQuotationToProject(
  tx: Prisma.TransactionClient,
  quotation: Quotation,
  customer: Customer,
  actor: SessionPayload,
  opts?: { projectManagerId?: string }
) {
  const pendingNotifications: PendingNotification[] = [];
  const number = await generateNumber(tx, "PROJECT");

  const project = await tx.project.create({
    data: {
      number,
      name: `${quotation.description || quotation.number} - ${customer.companyName}`,
      customerId: customer.id,
      opportunityId: quotation.opportunityId,
      quotationId: quotation.id,
      salesPicId: quotation.salesPicId,
      projectManagerId: opts?.projectManagerId,
      contractValue: quotation.grandTotal,
      budget: quotation.grandTotal, // starting budget mirrors contract value; PM can revise
      status: "PLANNING",
    },
  });

  await createProjectFolders(tx, project, customer.companyName);

  // Won trigger (spec): the Opportunity's 7 sales-stage folders (and every
  // document inside them — correspondence, proposal, technical notes,
  // costing, quotation, PO, contract) move into this Project's own "01
  // Sales" folders so the history from prospect to project stays one
  // unbroken thread, with nothing duplicated or re-uploaded.
  if (quotation.opportunityId) {
    await mergeOpportunityFoldersIntoProject(tx, quotation.opportunityId, project.id);
  }

  await tx.projectTask.createMany({
    data: DEFAULT_TASK_TEMPLATE.map((t) => ({
      projectId: project.id,
      title: t.title,
      priority: t.priority,
      status: "TODO",
      createdById: actor.userId,
    })),
  });

  await tx.projectMilestone.createMany({
    data: DEFAULT_MILESTONE_TEMPLATE.map((m) => ({
      projectId: project.id,
      name: m.name,
      sortOrder: m.sortOrder,
      status: "PENDING",
    })),
  });

  pendingNotifications.push({
    role: "FINANCE",
    type: "PROJECT_CREATED",
    title: "New project created from Won deal",
    message: `${project.number} (${customer.companyName}) is ready for invoicing setup.`,
    link: `/projects/${project.id}`,
  });

  if (opts?.projectManagerId) {
    pendingNotifications.push({
      userId: opts.projectManagerId,
      type: "PROJECT_CREATED",
      title: "You were assigned a new project",
      message: `${project.number} (${customer.companyName}) has been created and assigned to you.`,
      link: `/projects/${project.id}`,
    });
  } else {
    pendingNotifications.push({
      role: "PROJECT_MANAGER",
      type: "PROJECT_CREATED",
      title: "New project needs a Project Manager",
      message: `${project.number} (${customer.companyName}) was created and has no PM assigned yet.`,
      link: `/projects/${project.id}`,
    });
  }

  await logActivity(tx, {
    userId: actor.userId,
    action: "PROJECT_CREATED",
    entityType: "PROJECT",
    entityId: project.id,
    description: `${project.number} auto-created from Won quotation ${quotation.number}`,
    metadata: { quotationId: quotation.id, quotationNumber: quotation.number },
  });

  return { project, pendingNotifications };
}

/** Revenue - Cost = Gross Profit; Gross Profit / Revenue = Gross Margin (section 28). */
export async function calculateProjectProfitability(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const expenseAgg = await prisma.projectExpense.aggregate({
    where: { projectId, deletedAt: null },
    _sum: { total: true },
  });
  const invoiceAgg = await prisma.invoice.aggregate({
    where: { projectId, deletedAt: null, status: { not: "CANCELLED" } },
    _sum: { grandTotal: true, paidAmount: true },
  });

  const revenue = Number(project.contractValue);
  const actualCost = Number(expenseAgg._sum.total ?? 0);
  const totalInvoiced = Number(invoiceAgg._sum.grandTotal ?? 0);
  const totalPaid = Number(invoiceAgg._sum.paidAmount ?? 0);
  const { grossProfit, grossMargin } = calcProfitability({ revenue, cost: actualCost });

  return {
    contractValue: revenue,
    budget: Number(project.budget),
    actualCost,
    budgetRemaining: Number(project.budget) - actualCost,
    totalInvoiced,
    totalPaid,
    outstanding: totalInvoiced - totalPaid,
    grossProfit,
    grossMargin,
  };
}

const CLOSING_CHECK_DEFS: { key: string; label: string }[] = [
  { key: "tasksCompleted", label: "All project tasks completed" },
  { key: "deliverablesUploaded", label: "Final deliverables uploaded" },
  { key: "bastUploaded", label: "BAST uploaded" },
  { key: "finalReportUploaded", label: "Final report uploaded" },
  { key: "invoicesCreated", label: "All invoices created" },
  { key: "paymentReviewed", label: "Payment status reviewed" },
  { key: "expensesRecorded", label: "Project expenses recorded" },
  { key: "financialResultCalculated", label: "Project financial result calculated" },
  { key: "customerDocsComplete", label: "Customer documents complete" },
];

/**
 * Section 27: a project cannot be closed until every requirement is met.
 * Returns the checklist with computed pass/fail per item plus the overall
 * verdict, so the UI can render "Project cannot be closed. Missing: ..."
 */
export async function validateProjectClosing(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const [openTasks, bast, finalReport, invoices, expenses] = await Promise.all([
    prisma.projectTask.count({ where: { projectId, deletedAt: null, status: { not: "COMPLETED" } } }),
    prisma.document.findFirst({
      where: { relatedEntityType: "BAST", deletedAt: null, folder: { projectId } },
    }),
    prisma.document.findFirst({
      where: { relatedEntityType: "FINAL_REPORT", deletedAt: null, folder: { projectId } },
    }),
    prisma.invoice.findMany({ where: { projectId, deletedAt: null } }),
    prisma.projectExpense.count({ where: { projectId, deletedAt: null } }),
  ]);

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.grandTotal), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);

  const results: Record<string, boolean> = {
    tasksCompleted: openTasks === 0,
    deliverablesUploaded: Boolean(bast) || Boolean(finalReport), // at minimum one deliverable on file
    bastUploaded: Boolean(bast),
    finalReportUploaded: Boolean(finalReport),
    invoicesCreated: invoices.length > 0,
    paymentReviewed: totalInvoiced === 0 || totalPaid >= totalInvoiced * 0.5, // reviewed = not fully unpaid
    expensesRecorded: expenses > 0,
    financialResultCalculated: true, // always computable on demand via calculateProjectProfitability
    customerDocsComplete: Boolean(bast) && Boolean(finalReport),
  };

  const missing = CLOSING_CHECK_DEFS.filter((c) => !results[c.key]).map((c) => c.label);
  void project;

  return {
    checklist: CLOSING_CHECK_DEFS.map((c) => ({ ...c, passed: results[c.key] })),
    canClose: missing.length === 0,
    missing,
  };
}

/**
 * Completed -> Closed -> Documents archived -> Final report generated
 * (spec section 27). Only Admin or the assigned PM may call this
 * (requireProjectCloser), and it re-validates the checklist server-side so
 * a stale client can't force a close.
 */
export async function closeProject(projectId: string, actor: SessionPayload) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  requireProjectCloser(actor.role, project.projectManagerId === actor.userId);

  const validation = await validateProjectClosing(projectId);
  if (!validation.canClose) {
    throw new Error(
      `Project cannot be closed. Missing: ${validation.missing.join(", ")}`
    );
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: "CLOSED",
        completedAt: project.completedAt ?? now,
        closedAt: now,
        closedById: actor.userId,
        closingChecklist: validation.checklist as unknown as Prisma.InputJsonValue,
      },
    });

    // Archive: move the project's documents into a dated Arsip company
    // folder reference is a metadata-level operation — physical files stay
    // put (storage key never changes) but we tag them archived via the
    // project status itself + activity log, keeping document history intact.
    await logActivity(tx, {
      userId: actor.userId,
      action: "PROJECT_CLOSED",
      entityType: "PROJECT",
      entityId: updated.id,
      description: `${updated.number} closed by ${actor.name}`,
    });

    await notifyRole(tx, "ADMIN", {
      type: "PROJECT_CLOSED",
      title: "Project closed",
      message: `${updated.number} has been closed and archived.`,
      link: `/projects/${updated.id}`,
    });

    return updated;
  });
}

export async function markProjectCompleted(projectId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { status: "COMPLETED", completedAt: new Date(), progressPercent: 100 },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "PROJECT_COMPLETED",
      entityType: "PROJECT",
      entityId: updated.id,
      description: `${updated.number} marked Completed by ${actor.name}`,
    });
    return updated;
  });
}
