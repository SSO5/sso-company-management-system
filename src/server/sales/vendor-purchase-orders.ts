"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { vendorPurchaseOrderSchema } from "@/lib/validation/sales";
import { createVendorPurchaseOrder } from "@/lib/workflows/vendor-po";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function listVendorPurchaseOrders() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.vendorPurchaseOrder.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, project: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVendorPurchaseOrder(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.vendorPurchaseOrder.findFirstOrThrow({
    where: { id, deletedAt: null },
    include: {
      customer: { select: { id: true, companyName: true } },
      project: { select: { id: true, number: true } },
      items: { orderBy: { sortOrder: "asc" } },
      signer: { select: { name: true, title: true, signatureImageUrl: true } },
      createdBy: { select: { name: true } },
    },
  });
}

export async function createVendorPurchaseOrderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = vendorPurchaseOrderSchema.parse(input);
    const po = await createVendorPurchaseOrder(data, actor);
    revalidatePath("/procurement/vendor-po");
    return { id: po.id };
  });
}
