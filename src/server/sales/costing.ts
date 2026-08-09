"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { costingSheetSchema } from "@/lib/validation/costing";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  createCostingSheet,
  updateCostingSheet,
  markCostingFinal,
  reviseCostingSheet,
  deleteCostingSheet,
  convertCostingToQuotation,
} from "@/lib/workflows/costing";

export async function listCostingSheets() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.costingSheet.findMany({
    where: { deletedAt: null },
    include: {
      customer: { select: { companyName: true } },
      createdBy: { select: { name: true } },
      sections: { include: { items: { select: { sellingTotalPrice: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCostingSheet(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.costingSheet.findUniqueOrThrow({
    where: { id },
    include: {
      customer: true,
      opportunity: true,
      createdBy: { select: { name: true } },
      quotation: { select: { id: true, number: true, revision: true } },
      sections: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
    },
  });
}

export async function createCostingSheetAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = costingSheetSchema.parse(input);
    const sheet = await createCostingSheet(data, actor);
    revalidatePath("/sales/costing");
    return { id: sheet.id };
  });
}

export async function updateCostingSheetAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const data = costingSheetSchema.parse(input);
    const sheet = await updateCostingSheet(id, data, actor);
    revalidatePath(`/sales/costing/${id}`);
    return { id: sheet.id };
  });
}

export async function markCostingFinalAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    await markCostingFinal(id, actor);
    revalidatePath(`/sales/costing/${id}`);
    return { id };
  });
}

export async function reviseCostingSheetAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const sheet = await reviseCostingSheet(id, actor);
    revalidatePath(`/sales/costing/${id}`);
    return { id: sheet.id };
  });
}

export async function deleteCostingSheetAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "delete");
    await deleteCostingSheet(id, actor);
    revalidatePath("/sales/costing");
    return { id };
  });
}

export async function convertCostingToQuotationAction(
  id: string,
  opts: { salesPicId: string; signerId?: string; contactId?: string; validUntil?: string }
): Promise<ActionResult<{ quotationId: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const quotation = await convertCostingToQuotation(
      id,
      {
        salesPicId: opts.salesPicId,
        signerId: opts.signerId,
        contactId: opts.contactId,
        validUntil: opts.validUntil ? new Date(opts.validUntil) : undefined,
      },
      actor
    );
    revalidatePath(`/sales/costing/${id}`);
    revalidatePath("/sales/quotations");
    return { quotationId: quotation.id };
  });
}
