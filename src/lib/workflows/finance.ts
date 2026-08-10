import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole } from "@/lib/workflows/notify";
import { calcInvoiceTotals } from "@/lib/workflows/calculations";
import type { InvoiceInput, PaymentInput } from "@/lib/validation/finance";
import type { SessionPayload } from "@/lib/auth/session";

export async function createInvoice(input: InvoiceInput, actor: SessionPayload) {
  const totals = calcInvoiceTotals(input.items, input.discount);

  return prisma.$transaction(async (tx) => {
    const number = await generateNumber(tx, "INVOICE");
    const invoice = await tx.invoice.create({
      data: {
        number,
        customerId: input.customerId,
        projectId: input.projectId || null,
        quotationId: input.quotationId || null,
        contactId: input.contactId || null,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        customerPO: input.customerPO,
        poDate: input.poDate,
        deliveryDate: input.deliveryDate,
        jobNo: input.jobNo,
        salesPicId: input.salesPicId || null,
        notes: input.notes,
        dpPercent: input.dpPercent ?? null,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        grandTotal: totals.grandTotal,
        status: "ISSUED",
        createdById: actor.userId,
        items: {
          create: input.items.map((item, idx) => ({
            groupLabel: item.groupLabel,
            isNote: item.isNote,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            taxPercent: item.taxPercent,
            total: totals.lineTotals[idx],
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "INVOICE",
      entityId: invoice.id,
      description: `Created invoice ${invoice.number}${input.projectId ? ` for project` : ""}`,
    });

    return invoice;
  });
}

/**
 * Recording a payment (spec section 21) atomically:
 *  - creates the Payment row with a generated PAY-YYYY-#### number
 *  - recomputes the parent Invoice's paidAmount and status
 *  - auto-flips status to PAID once paidAmount >= grandTotal
 * Everything downstream (receivables dashboard, project financial summary,
 * profitability) reads live from Invoice/Payment, so nothing else needs to
 * be separately "synced".
 */
export async function recordPayment(input: PaymentInput, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });

    const outstanding = Number(invoice.grandTotal) - Number(invoice.paidAmount);
    if (input.amount > outstanding + 0.01) {
      throw new Error(
        `Payment amount (${input.amount}) exceeds the outstanding invoice balance (${outstanding}).`
      );
    }

    const number = await generateNumber(tx, "PAYMENT");
    const payment = await tx.payment.create({
      data: {
        number,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        projectId: invoice.projectId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        method: input.method,
        referenceNumber: input.referenceNumber,
        bankAccount: input.bankAccount,
        notes: input.notes,
        createdById: actor.userId,
      },
    });

    const newPaidAmount = Number(invoice.paidAmount) + input.amount;
    const newStatus = newPaidAmount >= Number(invoice.grandTotal) ? "PAID" : "PARTIALLY_PAID";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, status: newStatus },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "PAYMENT",
      entityType: "INVOICE",
      entityId: invoice.id,
      description: `${payment.number}: Rp ${input.amount.toLocaleString("id-ID")} recorded against ${invoice.number}`,
      metadata: { paymentId: payment.id, newStatus },
    });

    return payment;
  });
}

/**
 * Batch job (safe to call on dashboard load / a scheduled task) that flips
 * ISSUED/PARTIALLY_PAID invoices past their due date to OVERDUE and raises
 * a notification per newly-overdue invoice (spec sections 21/35).
 */
export async function refreshOverdueInvoices() {
  const now = new Date();
  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
      deletedAt: null,
    },
  });
  if (candidates.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const inv of candidates) {
      await tx.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
    }
    await notifyRole(tx, "FINANCE", {
      type: "INVOICE_OVERDUE",
      title: `${candidates.length} invoice(s) just went overdue`,
      message: candidates.map((i) => i.number).join(", "),
      link: "/finance/receivables",
    });
  });

  return candidates.length;
}
