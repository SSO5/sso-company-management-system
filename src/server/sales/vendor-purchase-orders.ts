"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { vendorPurchaseOrderSchema } from "@/lib/validation/sales";
import {
  createVendorPurchaseOrder,
  submitVendorPOForApproval,
  approveVendorPO,
  rejectVendorPO,
  markVendorPOSent,
} from "@/lib/workflows/vendor-po";
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
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      // The Finance-side half of this PO's cost — see
      // ProjectExpense.vendorPurchaseOrderId / markVendorPOSent.
      expense: { select: { id: true, number: true, approvalStatus: true, paymentStatus: true } },
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

export async function submitVendorPOAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    await submitVendorPOForApproval(id, actor);
    revalidatePath(`/procurement/vendor-po/${id}`);
    return { id };
  });
}

export async function approveVendorPOAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await approveVendorPO(id, actor);
    revalidatePath(`/procurement/vendor-po/${id}`);
    return { id };
  });
}

export async function rejectVendorPOAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await rejectVendorPO(id, reason, actor);
    revalidatePath(`/procurement/vendor-po/${id}`);
    return { id };
  });
}

export async function markVendorPOSentAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const updated = await markVendorPOSent(id, actor);
    revalidatePath(`/procurement/vendor-po/${id}`);
    revalidatePath("/finance/expenses");
    if (updated.projectId) revalidatePath(`/projects/${updated.projectId}`);
    return { id };
  });
}
