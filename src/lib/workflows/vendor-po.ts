import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole, notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { calcVendorPoTotals } from "@/lib/workflows/calculations";
import { requireVendorPOApprover } from "@/lib/permissions";
import type { VendorPurchaseOrderInput } from "@/lib/validation/sales";
import type { SessionPayload } from "@/lib/auth/session";

export async function createVendorPurchaseOrder(input: VendorPurchaseOrderInput, actor: SessionPayload) {
  const totals = calcVendorPoTotals(input.items, input.discount, input.taxPercent);

  return prisma.$transaction(async (tx) => {
    const number = await generateNumber(tx, "VENDOR_PO");
    const po = await tx.vendorPurchaseOrder.create({
      data: {
        number,
        vendorName: input.vendorName,
        vendorAddress: input.vendorAddress,
        vendorEmail: input.vendorEmail,
        vendorAttn: input.vendorAttn,
        deliveryName: input.deliveryName,
        deliveryAddress: input.deliveryAddress,
        deliveryAttn: input.deliveryAttn,
        customerId: input.customerId || null,
        projectId: input.projectId || null,
        poDate: input.poDate,
        quotationRef: input.quotationRef,
        projectRef: input.projectRef,
        paymentTerms: input.paymentTerms,
        deliveryTerms: input.deliveryTerms,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxPercent: input.taxPercent,
        tax: totals.tax,
        grandTotal: totals.grandTotal,
        notes: input.notes,
        signerId: input.signerId || actor.userId,
        createdById: actor.userId,
        items: {
          create: input.items.map((item, idx) => ({
            groupLabel: item.groupLabel,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: totals.lineTotals[idx],
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "VENDOR_PO",
      entityId: po.id,
      description: `Created vendor PO ${po.number} to ${po.vendorName}`,
    });

    return po;
  });
}

// ---------------------------------------------------------------------------
// MAKER-CHECKER: submit -> approve/reject -> send to vendor. Same pattern as
// Quotation (see lib/workflows/quotation.ts) — the maker cannot approve
// their own PO, "Direktur" = ADMIN role, WA + email fire only after the DB
// transaction commits (see lib/notifications/dispatch.ts for why).
// ---------------------------------------------------------------------------

export async function submitVendorPOForApproval(id: string, actor: SessionPayload) {
  const po = await prisma.$transaction(async (tx) => {
    const existing = await tx.vendorPurchaseOrder.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "DRAFT") {
      throw new Error("Only a draft vendor PO can be submitted for approval.");
    }
    const updated = await tx.vendorPurchaseOrder.update({
      where: { id },
      data: { status: "SUBMITTED", isLocked: true, submittedAt: new Date(), submittedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "VENDOR_PO", entityId: id,
      description: `${updated.number}: Draft -> Submitted for approval`,
    });
    await notifyRole(tx, "ADMIN", {
      type: "VENDOR_PO_APPROVAL",
      title: "Vendor PO awaiting approval",
      message: `${updated.number} to ${updated.vendorName} (Rp ${Number(updated.grandTotal).toLocaleString("id-ID")}) was submitted by ${actor.name} and needs your approval.`,
      link: `/procurement/vendor-po/${id}`,
    });
    return updated;
  });

  await dispatchOutbound(
    { role: "ADMIN" },
    {
      title: "Vendor PO awaiting approval",
      message: `${po.number} ke ${po.vendorName} (Rp ${Number(po.grandTotal).toLocaleString("id-ID")}) diajukan oleh ${actor.name} dan menunggu approval Anda.`,
      link: `/procurement/vendor-po/${id}`,
    }
  ).catch((err) => console.error("[submitVendorPOForApproval] dispatchOutbound failed:", err));

  return po;
}

export async function approveVendorPO(id: string, actor: SessionPayload) {
  const po = await prisma.$transaction(async (tx) => {
    const existing = await tx.vendorPurchaseOrder.findUniqueOrThrow({ where: { id } });
    requireVendorPOApprover(actor.role, actor.userId, existing.submittedById);
    if (existing.status !== "SUBMITTED") {
      throw new Error("Only a submitted vendor PO can be approved.");
    }
    const updated = await tx.vendorPurchaseOrder.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "APPROVE", entityType: "VENDOR_PO", entityId: id,
      description: `${updated.number}: Approved by ${actor.name}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "VENDOR_PO_APPROVED",
        title: "Vendor PO approved",
        message: `${updated.number} to ${updated.vendorName} has been approved and can now be sent to the vendor.`,
        link: `/procurement/vendor-po/${id}`,
      });
    }
    return updated;
  });

  if (po.submittedById) {
    await dispatchOutbound(
      { userId: po.submittedById },
      {
        title: "Vendor PO disetujui",
        message: `${po.number} ke ${po.vendorName} telah disetujui dan siap dikirim ke vendor.`,
        link: `/procurement/vendor-po/${id}`,
      }
    ).catch((err) => console.error("[approveVendorPO] dispatchOutbound failed:", err));
  }

  return po;
}

export async function rejectVendorPO(id: string, reason: string, actor: SessionPayload) {
  const po = await prisma.$transaction(async (tx) => {
    const existing = await tx.vendorPurchaseOrder.findUniqueOrThrow({ where: { id } });
    requireVendorPOApprover(actor.role, actor.userId, existing.submittedById);
    const updated = await tx.vendorPurchaseOrder.update({
      where: { id },
      data: { status: "REJECTED", isLocked: false, rejectedAt: new Date(), rejectedById: actor.userId, rejectionReason: reason },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "REJECT", entityType: "VENDOR_PO", entityId: id,
      description: `${updated.number}: Rejected - ${reason}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "VENDOR_PO_REJECTED",
        title: "Vendor PO rejected",
        message: `${updated.number} was rejected: ${reason}`,
        link: `/procurement/vendor-po/${id}`,
      });
    }
    return updated;
  });

  if (po.submittedById) {
    await dispatchOutbound(
      { userId: po.submittedById },
      { title: "Vendor PO ditolak", message: `${po.number} ditolak: ${reason}`, link: `/procurement/vendor-po/${id}` }
    ).catch((err) => console.error("[rejectVendorPO] dispatchOutbound failed:", err));
  }

  return po;
}

/** Approved -> Sent (PO actually dispatched to the vendor, e.g. via email/WA). */
export async function markVendorPOSent(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.vendorPurchaseOrder.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "APPROVED") {
      throw new Error("Only an approved vendor PO can be marked as sent.");
    }
    const updated = await tx.vendorPurchaseOrder.update({ where: { id }, data: { status: "SENT" } });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "VENDOR_PO", entityId: id,
      description: `${updated.number}: Approved -> Sent to vendor`,
    });
    return updated;
  });
}
