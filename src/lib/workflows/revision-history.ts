import { Prisma } from "@prisma/client";

/**
 * Read-only history of what a Costing Sheet / Quotation looked like at a
 * past revision — taken right before reviseCostingSheet/reviseQuotation
 * overwrites the live row for the next round (see those functions in
 * costing.ts/quotation.ts). The live record keeps mutating in place exactly
 * as before; these are purely an audit trail so R1/R2/R3... stay visible
 * after being superseded. Decimal/Date fields are converted to plain
 * number/ISO-string here since Prisma's Json column can't take a Decimal or
 * Date instance directly.
 */

export async function snapshotCostingSheetRevision(
  tx: Prisma.TransactionClient,
  costingSheetId: string,
  revision: number
) {
  const sheet = await tx.costingSheet.findUniqueOrThrow({
    where: { id: costingSheetId },
    include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } },
  });

  const snapshot = {
    projectTitle: sheet.projectTitle,
    jobNo: sheet.jobNo,
    costingDate: sheet.costingDate.toISOString(),
    operationalCost: Number(sheet.operationalCost),
    ppnPercent: Number(sheet.ppnPercent),
    pphFinalPercent: Number(sheet.pphFinalPercent),
    sections: sheet.sections.map((s) => ({
      code: s.code,
      name: s.name,
      items: s.items.map((i) => ({
        groupLabel: i.groupLabel,
        name: i.name,
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        currency: i.currency,
        costUnitPrice: Number(i.costUnitPrice),
        supplierDiscountPercent: Number(i.supplierDiscountPercent),
        marginPercent: Number(i.marginPercent),
        costTotal: Number(i.costTotal),
        sellingUnitPrice: Number(i.sellingUnitPrice),
        sellingTotalPrice: Number(i.sellingTotalPrice),
      })),
    })),
  };

  await tx.costingSheetRevisionHistory.upsert({
    where: { costingSheetId_revision: { costingSheetId, revision } },
    create: { costingSheetId, revision, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    update: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
}

export async function snapshotQuotationRevision(
  tx: Prisma.TransactionClient,
  quotationId: string,
  revision: number
) {
  const q = await tx.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  const snapshot = {
    description: q.description,
    status: q.status,
    quotationDate: q.quotationDate.toISOString(),
    subjectLine: q.subjectLine,
    commercialTerms: q.commercialTerms,
    subtotal: Number(q.subtotal),
    discount: Number(q.discount),
    tax: Number(q.tax),
    grandTotal: Number(q.grandTotal),
    items: q.items.map((i) => ({
      itemName: i.itemName,
      description: i.description,
      technicalSpec: i.technicalSpec,
      quantity: Number(i.quantity),
      unit: i.unit,
      unitPrice: Number(i.unitPrice),
      discountPercent: Number(i.discountPercent),
      taxPercent: Number(i.taxPercent),
      total: Number(i.total),
    })),
  };

  await tx.quotationRevisionHistory.upsert({
    where: { quotationId_revision: { quotationId, revision } },
    create: { quotationId, revision, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    update: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
}

export interface CostingSheetSnapshot {
  projectTitle: string;
  jobNo: string | null;
  costingDate: string;
  operationalCost: number;
  ppnPercent: number;
  pphFinalPercent: number;
  sections: {
    code: string;
    name: string;
    items: {
      groupLabel: string | null;
      name: string;
      description: string | null;
      quantity: number;
      unit: string;
      currency: string;
      costUnitPrice: number;
      supplierDiscountPercent: number;
      marginPercent: number;
      costTotal: number;
      sellingUnitPrice: number;
      sellingTotalPrice: number;
    }[];
  }[];
}

export interface QuotationSnapshot {
  description: string | null;
  status: string;
  // Added after the initial revision-history rollout — snapshots taken
  // before that keep working PDF-rendering-wise (route falls back to the
  // live Quotation's current values for these three) rather than 404ing or
  // rendering garbage.
  quotationDate?: string;
  subjectLine?: string | null;
  commercialTerms?: { title: string; body: string }[] | null;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  items: {
    itemName: string;
    description: string | null;
    technicalSpec: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountPercent: number;
    taxPercent: number;
    total: number;
  }[];
}
