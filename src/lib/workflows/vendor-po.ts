import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { calcVendorPoTotals } from "@/lib/workflows/calculations";
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
