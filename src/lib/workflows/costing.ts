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
    if (existing.status === "CONVERTED") {
      throw new Error("This costing sheet has already been converted to a quotation and can no longer be edited.");
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
    if (existing.status === "CONVERTED") {
      throw new Error("This costing sheet has already been converted to a quotation — revise the quotation instead.");
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
      description: `${sheet.number}: Revised to R${sheet.revision}`,
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
 * Costing -> Quotation (spec: carry costing line items straight into a
 * Quotation instead of re-typing everything). Selling prices computed on
 * the costing sheet become the quotation's unit prices; every costing line
 * item becomes one quotation item. The costing sheet is locked (CONVERTED)
 * so its numbers stay the historical source of truth for margin analysis.
 */
export async function convertCostingToQuotation(
  costingId: string,
  opts: { salesPicId: string; signerId?: string; contactId?: string; validUntil?: Date },
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
