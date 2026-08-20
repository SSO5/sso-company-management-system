"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { createOpportunityFolders } from "@/lib/workflows/folders";
import { opportunitySchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import type { OpportunityStatus } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth/session";

export async function listOpportunities() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.opportunity.findMany({
    where: { deletedAt: null },
    include: {
      customer: { select: { companyName: true } },
      salesPic: { select: { name: true } },
      folders: { where: { parentId: null }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOpportunityDetail(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id },
    include: {
      customer: { select: { id: true, companyName: true, number: true } },
      contact: { select: { id: true, name: true, position: true, email: true, phone: true } },
      salesPic: { select: { name: true } },
      quotations: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, revision: true, status: true, grandTotal: true } },
      // deletedAt filter matters here: a Project archived by
      // archiveWonArtifacts (lib/workflows/corrections.ts, after correcting
      // a wrongly-Won deal) must stop showing the "Won — Project created"
      // banner below once it's no longer the live outcome of this deal.
      projects: { where: { deletedAt: null }, select: { id: true, number: true } },
    },
  });
  const rootFolder = await prisma.folder.findFirst({ where: { opportunityId: id, parentId: null } });
  const folders = rootFolder
    ? await prisma.folder.findMany({ where: { parentId: rootFolder.id }, orderBy: { name: "asc" } })
    : [];
  return { opportunity, folders };
}

export async function createOpportunity(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = opportunitySchema.parse(input);

    const opp = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "OPPORTUNITY");
      const created = await tx.opportunity.create({
        data: { ...data, number },
        include: { customer: { select: { companyName: true } } },
      });

      // Pre-Won documents (draft quotations, technical notes, correspondence)
      // need a home from day one — don't wait for the deal to be Won.
      await createOpportunityFolders(tx, created, created.customer.companyName);

      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "OPPORTUNITY",
        entityId: created.id,
        description: `Created opportunity ${created.number} - ${created.name}`,
      });
      return created;
    });

    revalidatePath("/sales/opportunities");
    return { id: opp.id };
  });
}

/**
 * Permanently deletes ONE Opportunity card and everything generated from it
 * (Quotations, Costing Sheets, the Project if it was marked Won, POs,
 * Contracts, Invoices, Payments, Folders, Documents) — mirrors
 * prisma/delete-opportunity.ts exactly, exposed as an in-app action so
 * cleaning up a mistaken/trial deal doesn't require a terminal. Does NOT
 * touch the Customer/Contact — those stay. ADMIN-only (see permissions.ts —
 * "delete" on the "sales" module is the one action SALES doesn't have).
 */
export async function deleteOpportunity(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.opportunity.findUniqueOrThrow({ where: { id } });

    const [quotations, costingSheets, projects] = await Promise.all([
      tx.quotation.findMany({ where: { opportunityId: id }, select: { id: true } }),
      tx.costingSheet.findMany({ where: { opportunityId: id }, select: { id: true } }),
      tx.project.findMany({ where: { opportunityId: id }, select: { id: true } }),
    ]);
    const quotationIds = quotations.map((q) => q.id);
    const costingIds = costingSheets.map((c) => c.id);
    const projectIds = projects.map((p) => p.id);

    const folders = await tx.folder.findMany({
      where: { OR: [{ opportunityId: id }, { projectId: { in: projectIds } }] },
      select: { id: true },
    });
    const folderIds = folders.map((f) => f.id);
    const invoices = await tx.invoice.findMany({
      where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);

    await tx.payment.deleteMany({ where: { OR: [{ invoiceId: { in: invoiceIds } }, { projectId: { in: projectIds } }] } });
    await tx.invoice.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] } }); // cascades InvoiceItem
    await tx.contract.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] } });
    await tx.purchaseOrder.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] } });
    await tx.document.deleteMany({
      where: {
        OR: [
          { folderId: { in: folderIds } },
          { relatedEntityId: { in: [id, ...quotationIds, ...costingIds, ...projectIds] } },
        ],
      },
    });
    await tx.costingSheet.deleteMany({ where: { opportunityId: id } }); // cascades sections/items
    await tx.project.deleteMany({ where: { opportunityId: id } }); // cascades tasks/milestones/expenses/folders
    await tx.quotation.deleteMany({ where: { opportunityId: id } }); // cascades QuotationItem
    await tx.folder.deleteMany({ where: { opportunityId: id } });
    await tx.activityLog.deleteMany({ where: { entityId: { in: [id, ...quotationIds, ...costingIds, ...projectIds] } } });
    await tx.opportunity.delete({ where: { id } });

    await logActivity(tx, {
      userId: actor.userId,
      action: "DELETE",
      entityType: "OPPORTUNITY",
      entityId: id,
      description: `Deleted opportunity ${existing.number} - ${existing.name} (and everything generated from it) by ${actor.name}`,
    });

    return { number: existing.number };
  });
}

export async function deleteOpportunityAction(id: string): Promise<ActionResult<{ number: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "delete");
    const result = await deleteOpportunity(id, actor);
    revalidatePath("/sales/opportunities");
    revalidatePath("/documents");
    return result;
  });
}

/**
 * Manual pipeline-stage picker (NEW/QUALIFIED/PROPOSAL/NEGOTIATION only).
 * Won/Lost are deliberately excluded here — those are terminal, evidence-
 * backed outcomes that must only be reachable through markQuotationWon
 * (requires an approved/sent quotation, atomically creates the Project) and
 * markQuotationLost (requires a reason) in lib/workflows/quotation.ts. A
 * plain stage dropdown must never be able to fabricate a "Won" deal, or
 * silently downgrade one that's already decided (spec: "Perbaikan Deal
 * Stage & Revisi Costing-Quotation" — deals.stage may only change through
 * an explicit, accountable action, never as a side effect of routine CRUD).
 */
export async function updateOpportunityStage(
  id: string,
  status: OpportunityStatus
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");

    if (status === "WON" || status === "LOST") {
      throw new Error(
        'Won/Lost can\'t be set from the stage picker. Use "Mark Won" (creates the Project automatically) or "Mark Lost" (with a reason) on the deal\'s quotation instead.'
      );
    }

    await prisma.$transaction(async (tx) => {
      const before = await tx.opportunity.findUniqueOrThrow({ where: { id } });
      if (before.status === "WON" || before.status === "LOST") {
        throw new Error(`This deal is already ${before.status === "WON" ? "Won" : "Lost"} and its stage can no longer be changed manually.`);
      }
      await tx.opportunity.update({ where: { id }, data: { status } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "STATUS_CHANGE",
        entityType: "OPPORTUNITY",
        entityId: id,
        description: `${before.number}: ${before.status} -> ${status}`,
      });
    });

    revalidatePath("/sales/opportunities");
    return { id };
  });
}
