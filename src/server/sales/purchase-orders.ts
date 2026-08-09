"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { purchaseOrderSchema, contractSchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function listPurchaseOrders() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.purchaseOrder.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, project: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPurchaseOrder(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = purchaseOrderSchema.parse(input);

    const po = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "PURCHASE_ORDER");
      const created = await tx.purchaseOrder.create({ data: { ...data, number, createdById: actor.userId } });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "PURCHASE_ORDER", entityId: created.id,
        description: `Created PO ${created.number}`,
      });
      return created;
    });

    revalidatePath("/sales/purchase-orders");
    return { id: po.id };
  });
}

export async function listContracts() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.contract.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, project: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createContract(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = contractSchema.parse(input);

    const contract = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "CONTRACT");
      const created = await tx.contract.create({ data: { ...data, number, createdById: actor.userId } });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "CONTRACT", entityId: created.id,
        description: `Created contract ${created.number}`,
      });
      return created;
    });

    revalidatePath("/sales/contracts");
    return { id: contract.id };
  });
}
