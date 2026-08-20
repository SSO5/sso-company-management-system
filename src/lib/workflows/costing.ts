import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { calcCostingLine, calcCostingSummary } from "@/lib/workflows/calculations";
import { DEFAULT_COMMERCIAL_TERMS } from "@/lib/validation/sales";
import type { CostingSheetInput } from "@/lib/validation/costing";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Costing sheet CRUD (spec: dynamic, mobile-friendly costing under Sales —
 * PIC types quantity/cost/margin per line, the app computes everything
 * else). A costing sheet is DRAFT while being worked on, can be marked
 * FINAL when ready to price a quotation from, and CONVERTED once it has
 * been turned into a Quotation (see convertCostingToQuotation below).
 */

/**
 * A CONVERTED costing sheet is only permanently immutable once the deal it
 * belongs to is decided (its linked quotation is WON or LOST) — negotiation
 * being ongoing is never a reason to lock it, only the outcome is (spec:
 * "Perbaikan Deal Stage & Revisi Costing-Quotation"). A sheet that lost its
 * quotationId was superseded by a later revision (see
 * convertCostingToQuotationAsRevision) and stays locked as a historical
 * snapshot regardless of the deal's current state.
 */
async function getCostingLockReason(
  tx: Prisma.TransactionClient,
  sheet: { status: string; quotationId: string | null }
): Promise<string | null> {
  if (sheet.status !== "CONVERTED") return null;
  if (!sheet.quotationId) {
    return "This costing sheet was superseded by a later revision and stays locked as a historical record.";
  }
  const quotation = await tx.quotation.findUnique({
    where: { id: sheet.quotationId },
    select: { status: true, number: true },
  });
  if (quotation && (quotation.status === "WON" || quotation.status === "LOST")) {
    return `Quotation ${quotation.number} is already ${quotation.status === "WON" ? "Won" : "Lost"} — this costing sheet is locked as the final record.`;
  }
  return null;
}
export async function createCostingSheet(input: CostingSheetInput, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const number = await generateNumber(tx, "COSTING");
    const sheet = await tx.costingSheet.create({
      data: {
        number,
        customerId: input.customerId,
        opportunityId: input.opportunityId || null,
        projectTitle: input.projectTitle,
        jobNo: input.jobNo,
        costingDate: input.costingDate,
        notes: input.notes,
        operationalCost: input.operationalCost ?? 0,
        ppnPercent: input.ppnPercent ?? 11,
        pphFinalPercent: input.pphFinalPercent ?? 2,
        status: "DRAFT",
        createdById: actor.userId,
        sections: {
          create: input.sections.map((section, sIdx) => ({
            code: section.code,
            name: section.name,
            sortOrder: sIdx,
            items: {
              create: section.items.map((item, iIdx) => {
                const calc = calcCostingLine(item);
                return {
                  groupLabel: item.groupLabel,
                  name: item.name,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  currency: item.currency,
                  costUnitPrice: item.costUnitPrice,
                  supplierDiscountPercent: item.supplierDiscountPercent,
                  marginPercent: item.marginPercent,
                  costTotal: calc.costTotal,
                  sellingUnitPrice: calc.sellingUnitPrice,
                  sellingTotalPrice: calc.sellingTotalPrice,
                  sortOrder: iIdx,
                };
              }),
            },
          })),
        },
      },
      include: { sections: { include: { items: true } } },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "COSTING",
      entityId: sheet.id,
      description: `Created costing sheet ${sheet.number}`,
    });

    return sheet;
  });
}

export async function updateCostingSheet(id: string, input: CostingSheetInput, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.costingSheet.findUniqueOrThrow({ where: { id } });
    const lockReason = await getCostingLockReason(tx, existing);
    if (lockReason) {
      throw new Error(`${lockReason} Use "Buat Revisi" to reopen it first.`);
    }
    if (existing.status === "CONVERTED") {
      throw new Error('This costing sheet has already been converted to a quotation. Use "Buat Revisi" to reopen it for editing.');
    }

    // Simplest safe strategy for a dynamic sections/items form: replace the
    // whole sections/items tree inside the transaction rather than diffing.
    await tx.costingSection.deleteMany({ where: { costingSheetId: id } });

    const sheet = await tx.costingSheet.update({
      where: { id },
      data: {
        customerId: input.customerId,
        opportunityId: input.opportunityId || null,
        projectTitle: input.projectTitle,
        jobNo: input.jobNo,
        costingDate: input.costingDate,
        notes: input.notes,
        operationalCost: input.operationalCost ?? 0,
        ppnPercent: input.ppnPercent ?? 11,
        pphFinalPercent: input.pphFinalPercent ?? 2,
        sections: {
          create: input.sections.map((section, sIdx) => ({
            code: section.code,
            name: section.name,
            sortOrder: sIdx,
            items: {
              create: section.items.map((item, iIdx) => {
                const calc = calcCostingLine(item);
                return {
                  groupLabel: item.groupLabel,
                  name: item.name,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  currency: item.currency,
                  costUnitPrice: item.costUnitPrice,
                  supplierDiscountPercent: item.supplierDiscountPercent,
                  marginPercent: item.marginPercent,
                  costTotal: calc.costTotal,
                  sellingUnitPrice: calc.sellingUnitPrice,
                  sellingTotalPrice: calc.sellingTotalPrice,
                  sortOrder: iIdx,
                };
              }),
            },
          })),
        },
      },
      include: { sections: { include: { items: true } } },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "COSTING",
      entityId: sheet.id,
      description: `Updated costing sheet ${sheet.number}`,
    });

    return sheet;
  });
}

export async function markCostingFinal(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.costingSheet.update({ where: { id }, data: { status: "FINAL" } });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "COSTING", entityId: sheet.id,
      description: `${sheet.number}: Draft -> Final`,
    });
    return sheet;
  });
}

/**
 * Bump a costing sheet's revision counter (".R1", ".R2" — same convention as
 * Quotation.revision). A costing sheet is already freely editable up until
 * CONVERTED, so this doesn't unlock anything by itself — it's for labeling:
 * once meaningful changes have been made (new supplier price, revised
 * margin, etc.) and the sheet is being recirculated for review, bump the
 * revision so the printed number and PDF reflect that it's not the original
 * version anymore. FINAL is reset back to DRAFT since a revised sheet needs
 * re-approval before it can be converted again.
 */
export async function reviseCostingSheet(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.costingSheet.findUniqueOrThrow({ where: { id } });
    const lockReason = await getCostingLockReason(tx, existing);
    if (lockReason) {
      throw new Error(lockReason);
    }

    // Reopening a CONVERTED-but-unlocked sheet (deal not Won/Lost yet) also
    // reopens its linked quotation in lockstep, mirroring what
    // reviseQuotation does from the quotation side — otherwise the
    // quotation would keep showing stale items/totals from before this
    // revision. Only needed when that quotation isn't already DRAFT (a
    // DRAFT quotation is already directly editable).
    let reopenedQuotationNumber: string | null = null;
    if (existing.status === "CONVERTED" && existing.quotationId) {
      const linked = await tx.quotation.findUnique({
        where: { id: existing.quotationId },
        select: { id: true, number: true, status: true },
      });
      if (linked && linked.status !== "DRAFT") {
        await tx.quotation.update({
          where: { id: linked.id },
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
        reopenedQuotationNumber = linked.number;
      }
    }

    const sheet = await tx.costingSheet.update({
      where: { id },
      data: { revision: { increment: 1 }, status: "DRAFT" },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "COSTING",
      entityId: sheet.id,
      description: `${sheet.number}: Revised to R${sheet.revision}` +
        (reopenedQuotationNumber ? ` (reopened linked quotation ${reopenedQuotationNumber})` : ""),
    });
    return sheet;
  });
}

export async function deleteCostingSheet(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.costingSheet.findUniqueOrThrow({ where: { id } });
    if (existing.status === "CONVERTED") {
      throw new Error("Cannot delete a costing sheet that has been converted to a quotation.");
    }
    await tx.costingSheet.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(tx, {
      userId: actor.userId, action: "DELETE", entityType: "COSTING", entityId: id,
      description: `Deleted costing sheet ${existing.number}`,
    });
  });
}

/**
 * Deal-aware check for the "Convert to Quotation" action (spec: "Perbaikan
 * Deal Stage & Revisi Costing-Quotation" — a second costing sheet for a deal
 * that already has a quotation should default to becoming a new revision of
 * it, not spawn an unrelated second Quotation). Only ever surfaces a
 * quotation that could still receive a revision; a WON/LOST one is a closed
 * chapter and never offered here.
 */
export async function getActiveQuotationForOpportunity(opportunityId: string) {
  return prisma.quotation.findFirst({
    where: { opportunityId, deletedAt: null, status: { notIn: ["WON", "LOST"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, revision: true, status: true },
  });
}

/**
 * Costing -> Quotation (spec: carry costing line items straight into a
 * Quotation instead of re-typing everything). Selling prices computed on
 * the costing sheet become the quotation's unit prices; every costing line
 * item becomes one quotation item. The costing sheet is locked (CONVERTED)
 * so its numbers stay the historical source of truth for margin analysis.
 *
 * `confirmedSeparate` is the explicit escape hatch from
 * getActiveQuotationForOpportunity's default: the UI must set it once the
 * user has been shown the existing quotation and chosen "Buat Quotation
 * Terpisah" anyway (real scope-is-actually-different case), so this never
 * silently forks a deal's pricing into two disconnected quotations.
 */
export async function convertCostingToQuotation(
  costingId: string,
  opts: { salesPicId: string; signerId?: string; contactId?: string; validUntil?: Date; confirmedSeparate?: boolean },
  actor: SessionPayload
) {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.costingSheet.findUniqueOrThrow({
      where: { id: costingId },
      include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (sheet.status === "CONVERTED") {
      throw new Error("This costing sheet has already been converted to a quotation.");
    }
    if (sheet.quotationId) {
      throw new Error("This costing sheet is already linked to a quotation.");
    }
    if (sheet.opportunityId && !opts.confirmedSeparate) {
      const active = await tx.quotation.findFirst({
        where: { opportunityId: sheet.opportunityId, deletedAt: null, status: { notIn: ["WON", "LOST"] } },
        select: { number: true },
      });
      if (active) {
        throw new Error(
          `This deal already has an open quotation (${active.number}). Convert this costing as a revision of it, or explicitly choose to create a separate quotation.`
        );
      }
    }

    const allItems = sheet.sections.flatMap((s) => s.items);
    const summary = calcCostingSummary(sheet.sections.map((s) => ({ items: s.items.map((i) => ({
      quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
      supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
    })) })));

    const number = await generateNumber(tx, "QUOTATION");
    const quotation = await tx.quotation.create({
      data: {
        number,
        customerId: sheet.customerId,
        contactId: opts.contactId || null,
        opportunityId: sheet.opportunityId,
        quotationDate: new Date(),
        validUntil: opts.validUntil,
        salesPicId: opts.salesPicId,
        signerId: opts.signerId || opts.salesPicId,
        description: sheet.projectTitle,
        commercialTerms: DEFAULT_COMMERCIAL_TERMS as unknown as Prisma.InputJsonValue,
        subtotal: summary.totalSelling,
        discount: 0,
        tax: 0,
        grandTotal: summary.totalSelling,
        status: "DRAFT",
        createdById: actor.userId,
        items: {
          create: allItems.map((item, idx) => ({
            itemName: item.name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.sellingUnitPrice,
            discountPercent: 0,
            taxPercent: 0,
            total: item.sellingTotalPrice,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await tx.costingSheet.update({
      where: { id: costingId },
      data: { status: "CONVERTED", quotationId: quotation.id },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `Created quotation ${quotation.number} from costing sheet ${sheet.number}`,
    });

    return quotation;
  });
}

/**
 * Costing -> Quotation, revision path (spec 3.2): attaches a new costing
 * sheet's numbers to an EXISTING quotation on the same deal as its next
 * revision, instead of creating a disconnected new Quotation record. Same
 * item-carrying logic as convertCostingToQuotation, just targeting the
 * existing quotation's own record (document number stays the same, only
 * `revision` goes up — same convention as reviseQuotation).
 *
 * The costing sheet that previously fed the target quotation, if any, is
 * unlinked (quotationId -> null) but left CONVERTED — it stays locked as an
 * immutable historical snapshot of that earlier round's cost/margin numbers
 * rather than being mutated or deleted.
 */
export async function convertCostingToQuotationAsRevision(
  costingId: string,
  targetQuotationId: string,
  actor: SessionPayload
) {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.costingSheet.findUniqueOrThrow({
      where: { id: costingId },
      include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (sheet.status === "CONVERTED") {
      throw new Error("This costing sheet has already been converted to a quotation.");
    }
    if (sheet.quotationId) {
      throw new Error("This costing sheet is already linked to a quotation.");
    }

    const target = await tx.quotation.findUniqueOrThrow({ where: { id: targetQuotationId } });
    if (target.opportunityId !== sheet.opportunityId) {
      throw new Error("This quotation does not belong to the same deal as this costing sheet.");
    }
    if (target.status === "WON" || target.status === "LOST") {
      throw new Error(`Quotation ${target.number} is already ${target.status === "WON" ? "Won" : "Lost"} and can no longer be revised.`);
    }

    const allItems = sheet.sections.flatMap((s) => s.items);
    const summary = calcCostingSummary(sheet.sections.map((s) => ({ items: s.items.map((i) => ({
      quantity: Number(i.quantity), costUnitPrice: Number(i.costUnitPrice),
      supplierDiscountPercent: Number(i.supplierDiscountPercent), marginPercent: Number(i.marginPercent),
    })) })));

    const previousCosting = await tx.costingSheet.findUnique({ where: { quotationId: target.id } });
    if (previousCosting) {
      await tx.costingSheet.update({ where: { id: previousCosting.id }, data: { quotationId: null } });
    }

    await tx.quotationItem.deleteMany({ where: { quotationId: target.id } });

    const quotation = await tx.quotation.update({
      where: { id: target.id },
      data: {
        description: sheet.projectTitle,
        subtotal: summary.totalSelling,
        discount: 0,
        tax: 0,
        grandTotal: summary.totalSelling,
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
        items: {
          create: allItems.map((item, idx) => ({
            itemName: item.name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.sellingUnitPrice,
            discountPercent: 0,
            taxPercent: 0,
            total: item.sellingTotalPrice,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await tx.costingSheet.update({
      where: { id: costingId },
      data: { status: "CONVERTED", quotationId: quotation.id },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "QUOTATION",
      entityId: quotation.id,
      description: `${quotation.number}: Revised to R${quotation.revision} from costing sheet ${sheet.number}` +
        (previousCosting ? ` (supersedes ${previousCosting.number})` : ""),
    });

    // Same reasoning as reviseQuotation: a revision restarts the sales
    // conversation, so don't leave the Opportunity sitting at a stage that
    // implies the customer already has an offer in hand.
    if (quotation.opportunityId) {
      const opp = await tx.opportunity.findUnique({ where: { id: quotation.opportunityId }, select: { status: true } });
      if (opp && opp.status !== "WON" && opp.status !== "LOST") {
        await tx.opportunity.update({ where: { id: quotation.opportunityId }, data: { status: "QUALIFIED" } });
      }
    }

    return quotation;
  });
}
