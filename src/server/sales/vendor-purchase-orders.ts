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
import { uploadDocument } from "@/lib/workflows/documents";
import { logActivity } from "@/lib/workflows/audit";

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
  const po = await prisma.vendorPurchaseOrder.findFirstOrThrow({
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
  const confirmationDocument = await prisma.document.findFirst({
    where: { relatedEntityType: "VENDOR_PO", relatedEntityId: id, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, originalName: true, uploadedAt: true },
  });
  return { ...po, confirmationDocument };
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

export async function confirmVendorPOAction(id: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const po = await prisma.vendorPurchaseOrder.findFirstOrThrow({ where: { id, deletedAt: null } });
    if (po.status !== "SENT") throw new Error("Konfirmasi hanya dapat dicatat setelah PO dikirim ke vendor.");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Unggah PO yang sudah dikonfirmasi vendor.");
    const document = await uploadDocument({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      projectId: po.projectId,
      relatedEntityType: "VENDOR_PO",
      relatedEntityId: po.id,
      description: `Bukti konfirmasi vendor untuk ${po.number}`,
    }, actor);

    await prisma.$transaction(async (tx) => {
      await tx.vendorPurchaseOrder.update({ where: { id }, data: { status: "CONFIRMED" } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "STATUS_CHANGE",
        entityType: "VENDOR_PO",
        entityId: id,
        description: `${po.number}: Dikonfirmasi vendor dengan bukti ${file.name}`,
        metadata: { documentId: document.id },
      });
    });

    revalidatePath(`/procurement/vendor-po/${id}`);
    if (po.projectId) revalidatePath(`/projects/${po.projectId}`);
    return { id };
  });
}
