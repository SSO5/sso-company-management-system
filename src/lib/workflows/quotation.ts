import { Prisma, type OpportunityStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole } from "@/lib/workflows/notify";
import { calcQuotationTotals } from "@/lib/workflows/calculations";
import { convertQuotationToProject } from "@/lib/workflows/project";
import { DEFAULT_COMMERCIAL_TERMS, type QuotationInput } from "@/lib/validation/sales";
import type { SessionPayload } from "@/lib/auth/session";
import { ForbiddenError, requireQuotationApprover } from "@/lib/permissions";

/**
 * Quotation status <-> Opportunity pipeline stage sync (spec: "pergantian
 * status quotation juga menjadi triger untuk memindahkan posisi opportunity
 * sudah sampai tahapan mana"). Stage only ever moves forward — a quotation
 * bouncing back to an earlier status (e.g. rejected -> re-drafted) doesn't
 * regress the Opportunity, and WON/LOST are terminal so nothing after them
 * ever overwrites the final outcome.
 */
const OPPORTUNITY_STAGE_ORDER: OpportunityStatus[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

async function advanceOpportunityStage(
  tx: Prisma.TransactionClient,
  opportunityId: string | null | undefined,
  target: OpportunityStatus
) {
  if (!opportunityId) return;
  const opp = await tx.opportunity.findUnique({ where: { id: opportunityId }, select: { status: true } });
  if (!opp || opp.status === "WON" || opp.status === "LOST") return;
  const currentIdx = OPPORTUNITY_STAGE_ORDER.indexOf(opp.status);
  const targetIdx = OPPORTUNITY_STAGE_ORDER.indexOf(target);
  if (targetIdx > currentIdx) {
    await tx.opportunity.update({ where: { id: opportunityId }, data: { status: target } });
  }
}

export async function createQuotation(input: QuotationInput, actor: SessionPayload) {
  const totals = calcQuotationTotals(input.items, input.discount);

  return prisma.$transaction(async (tx) => {
    const number = await generateNumber(tx, "QUOTATION");
    const quotation = await tx.quotation.create({
      data: {
        number,
        customerId: input.customerId,
        contactId: input.contactId || null,
        opportunityId: input.opportunityId || null,
        quotationDate: input.quotationDate,
        validUntil: input.validUntil,
        salesPicId: input.salesPicId,
        // PIC/TTD is customizable per quotation: whoever is picked as signer
        // owns the name/title/signature image printed on the PDF. Falls
        // back to the sales PIC so every quotation has a signer by default.
        signerId: input.signerId || input.salesPicId,
        description: input.description,
        subjectLine: input.subjectLine,
        terms: input.terms,
        notes: input.notes,
        commercialTerms: (input.commercialTerms && input.commercialTerms.length > 0
          ? input.commercialTerms
          : DEFAULT_COMMERCIAL_TERMS) as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        grandTotal: totals.grandTotal,
        status: "DRAFT",
        createdById: actor.userId,
        items: {
          create: input.items.map((item, idx) => ({
            itemName: item.itemName,
            description: item.description,
            technicalSpec: item.technicalSpec,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            taxPercent: item.taxPercent,
            total: totals.lineTotals[idx],
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `Created quotation ${quotation.number}`,
    });

    await advanceOpportunityStage(tx, quotation.opportunityId, "QUALIFIED");

    return quotation;
  });
}

/**
 * Edit a DRAFT quotation in place (spec: PIC must be able to review/adjust
 * everything — including the "Commercial Provisions" terms grid — before
 * submitting, whether the quotation was hand-typed via "New Quotation" or
 * auto-generated from a Costing Sheet via convertCostingToQuotation). Only
 * DRAFT quotations are editable; once submitted, isLocked freezes commercial
 * terms per the approval-integrity rule (spec section 47). Items are fully
 * replaced rather than diffed, matching the same simple strategy used by
 * updateCostingSheet.
 */
export async function updateQuotation(quotationId: string, input: QuotationInput, actor: SessionPayload) {
  const totals = calcQuotationTotals(input.items, input.discount);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft quotations can be edited. Submitted quotations are locked.");
    }

    await tx.quotationItem.deleteMany({ where: { quotationId } });

    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: {
        customerId: input.customerId,
        contactId: input.contactId || null,
        opportunityId: input.opportunityId || null,
        quotationDate: input.quotationDate,
        validUntil: input.validUntil,
        salesPicId: input.salesPicId,
        signerId: input.signerId || input.salesPicId,
        description: input.description,
        subjectLine: input.subjectLine,
        terms: input.terms,
        notes: input.notes,
        commercialTerms: (input.commercialTerms && input.commercialTerms.length > 0
          ? input.commercialTerms
          : DEFAULT_COMMERCIAL_TERMS) as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        grandTotal: totals.grandTotal,
        items: {
          create: input.items.map((item, idx) => ({
            itemName: item.itemName,
            description: item.description,
            technicalSpec: item.technicalSpec,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            taxPercent: item.taxPercent,
            total: totals.lineTotals[idx],
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `Updated quotation ${quotation.number}`,
    });

    await advanceOpportunityStage(tx, quotation.opportunityId, "QUALIFIED");

    return quotation;
  });
}

/** Draft -> Submitted. Locks commercial fields and notifies the approver (Admin). */
export async function submitQuotationForApproval(quotationId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft quotations can be submitted for approval.");
    }

    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: "SUBMITTED",
        isLocked: true,
        submittedAt: new Date(),
        submittedById: actor.userId,
      },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "STATUS_CHANGE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Draft -> Submitted for approval`,
    });

    await notifyRole(tx, "ADMIN", {
      type: "QUOTATION_APPROVAL",
      title: "Quotation awaiting approval",
      message: `${quotation.number} was submitted by ${actor.name} and needs your approval.`,
      link: `/sales/quotations/${quotation.id}`,
    });

    await advanceOpportunityStage(tx, quotation.opportunityId, "PROPOSAL");

    return quotation;
  });
}

export async function approveQuotation(quotationId: string, actor: SessionPayload) {
  requireQuotationApprover(actor.role);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(existing.status)) {
      throw new Error("Only submitted quotations can be approved.");
    }
    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.userId },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "APPROVE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Approved by ${actor.name}`,
    });

    await notifyUserBySalesPic(tx, quotation.salesPicId, {
      type: "QUOTATION_APPROVED",
      title: "Quotation approved",
      message: `${quotation.number} has been approved and can now be sent to the customer.`,
      link: `/sales/quotations/${quotation.id}`,
    });

    await advanceOpportunityStage(tx, quotation.opportunityId, "PROPOSAL");

    return quotation;
  });
}

export async function rejectQuotation(quotationId: string, reason: string, actor: SessionPayload) {
  requireQuotationApprover(actor.role);
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectedById: actor.userId,
        rejectionReason: reason,
        isLocked: false,
      },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "REJECT",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Rejected - ${reason}`,
    });

    await notifyUserBySalesPic(tx, quotation.salesPicId, {
      type: "QUOTATION_REJECTED",
      title: "Quotation rejected",
      message: `${quotation.number} was rejected: ${reason}`,
      link: `/sales/quotations/${quotation.id}`,
    });

    return quotation;
  });
}

export async function markQuotationSent(quotationId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "SENT", sentAt: new Date() },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "STATUS_CHANGE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Approved -> Sent to customer`,
    });
    await advanceOpportunityStage(tx, quotation.opportunityId, "NEGOTIATION");
    return quotation;
  });
}

/**
 * THE most important automation in the system (spec section 11).
 * Marking a quotation WON atomically creates the Project, its folder tree,
 * default tasks, notifications, and activity log — all inside one
 * transaction so a partial failure never leaves an orphaned half-created
 * project. See lib/workflows/project.ts:convertQuotationToProject.
 */
export async function markQuotationWon(
  quotationId: string,
  actor: SessionPayload,
  opts?: { projectManagerId?: string }
) {
  if (!["ADMIN", "SALES"].includes(actor.role)) {
    throw new ForbiddenError("Only Sales or Admin can mark a quotation as Won.");
  }
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      include: { customer: true },
    });
    if (!["SENT", "APPROVED"].includes(quotation.status)) {
      throw new Error("Only an approved/sent quotation can be marked Won.");
    }

    const won = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "WON", wonAt: new Date() },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "STATUS_CHANGE",
      entityType: "QUOTATION",
      entityId: won.id,
      description: `${won.number}: -> WON`,
    });

    if (won.opportunityId) {
      await tx.opportunity.update({ where: { id: won.opportunityId }, data: { status: "WON" } });
    }

    const project = await convertQuotationToProject(tx, won, quotation.customer, actor, opts);
    return { quotation: won, project };
  });
}

/**
 * Revise a quotation that's already past DRAFT (spec: real quotations get
 * reissued as ".R1", ".R2" etc. when the customer asks for changes, or after
 * an internal rejection — e.g. the real "005/QUO/MKT/V/2026.R2" seen in
 * SSO's own files). Reopens the SAME record for editing rather than creating
 * a new one: bumps `revision`, resets status back to DRAFT/unlocked, and
 * clears the submit/approve/reject/send timestamps so the approval lifecycle
 * runs cleanly again. The base `number` is untouched — display code appends
 * the ".R{revision}" suffix (see lib/utils.ts:formatRevisedNumber).
 * WON/LOST are terminal and DRAFT is already directly editable, so neither
 * goes through this path.
 */
const REVISABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SENT"];

export async function reviseQuotation(quotationId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    if (!REVISABLE_STATUSES.includes(existing.status)) {
      throw new Error(
        existing.status === "DRAFT"
          ? "This quotation is already a draft and can be edited directly."
          : "Won or Lost quotations cannot be revised."
      );
    }

    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: "DRAFT",
        isLocked: false,
        revision: { increment: 1 },
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
        sentAt: null,
      },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Revised to R${quotation.revision} (was ${existing.status}) — reopened as Draft`,
    });

    // A revision restarts the sales conversation — don't leave the
    // Opportunity sitting at a stage that implies the customer already has
    // an offer in hand while it's back in Draft being reworked.
    if (quotation.opportunityId) {
      const opp = await tx.opportunity.findUnique({ where: { id: quotation.opportunityId }, select: { status: true } });
      if (opp && opp.status !== "WON" && opp.status !== "LOST") {
        await tx.opportunity.update({ where: { id: quotation.opportunityId }, data: { status: "QUALIFIED" } });
      }
    }

    return quotation;
  });
}

/**
 * Deletes a quotation that never left DRAFT — the one safe window to remove
 * one outright, since spec requires an issued/burned number never be reused
 * (see numbering-registry.ts's void-not-delete pattern). This exists for the
 * "salah input nomor/data quotation" case: a data-entry mistake caught while
 * still drafting, before anything was submitted, sent, or seen by a
 * customer or approver. Soft-deletes (sets deletedAt) rather than
 * hard-deleting so the mistake and its burned number stay visible on the
 * audit trail instead of vanishing without a trace.
 */
export async function deleteQuotation(quotationId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    if (existing.status !== "DRAFT") {
      throw new Error(
        "Only a draft quotation (never submitted) can be deleted. For one already sent/approved, use \"Mark Lost\" instead."
      );
    }

    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: { deletedAt: new Date() },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "DELETE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Deleted (draft) by ${actor.name}`,
    });

    return quotation;
  });
}

export async function markQuotationLost(quotationId: string, reason: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "LOST", lostAt: new Date(), lostReason: reason },
    });
    if (quotation.opportunityId) {
      await tx.opportunity.update({ where: { id: quotation.opportunityId }, data: { status: "LOST" } });
    }
    await logActivity(tx, {
      userId: actor.userId,
      action: "STATUS_CHANGE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: -> LOST (${reason})`,
    });
    return quotation;
  });
}

async function notifyUserBySalesPic(
  tx: Parameters<typeof notifyRole>[0],
  userId: string,
  params: { type: string; title: string; message: string; link?: string }
) {
  await tx.notification.create({ data: { userId, ...params } });
}
