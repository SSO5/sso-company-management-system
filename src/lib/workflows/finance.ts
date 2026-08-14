import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole, notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { calcInvoiceTotals, invoiceDueAmount } from "@/lib/workflows/calculations";
import { requireInvoiceApprover } from "@/lib/permissions";
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
        // Maker-checker: an invoice now starts as a DRAFT and needs Admin
        // (Direktur) approval before it's ISSUED to the customer — it used
        // to jump straight to ISSUED, which skipped review entirely.
        status: "DRAFT",
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

    if (!["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
      throw new Error("Payments can only be recorded against an issued invoice (it must be approved and issued first).");
    }

    // Outstanding is measured against what THIS document actually bills —
    // grandTotal * dpPercent/100 for a staged/DP invoice, not the full
    // contract value — minus cash already paid AND tax already withheld
    // (see invoiceOutstanding()). Otherwise a fully-paid 20% DP invoice
    // would happily accept another payment up to the other 80% it was
    // never meant to collect, or reject a legitimate net-of-WHT payment as
    // "exceeding" a balance that never accounted for the withholding.
    const dueAmount = invoiceDueAmount(invoice);
    const outstanding = dueAmount - Number(invoice.paidAmount) - Number(invoice.withholdingTax);
    const settling = input.amount + (input.withholdingTax ?? 0);
    if (settling > outstanding + 0.01) {
      throw new Error(
        `Payment + withholding (${settling}) exceeds the outstanding invoice balance (${outstanding}).`
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
        withholdingTax: input.withholdingTax ?? 0,
        createdById: actor.userId,
      },
    });

    const newPaidAmount = Number(invoice.paidAmount) + input.amount;
    const newWithholdingTax = Number(invoice.withholdingTax) + (input.withholdingTax ?? 0);
    const newStatus = newPaidAmount + newWithholdingTax >= dueAmount ? "PAID" : "PARTIALLY_PAID";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, withholdingTax: newWithholdingTax, status: newStatus },
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

// ---------------------------------------------------------------------------
// MAKER-CHECKER for Invoice — same pattern as Quotation / Vendor PO /
// Project Expense: Draft -> Submitted -> Approved/Rejected -> Issued.
// ---------------------------------------------------------------------------

export async function submitInvoiceForApproval(id: string, actor: SessionPayload) {
  const invoice = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "DRAFT") {
      throw new Error("Only a draft invoice can be submitted for approval.");
    }
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "SUBMITTED", isLocked: true, submittedAt: new Date(), submittedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "INVOICE", entityId: id,
      description: `${updated.number}: Draft -> Submitted for approval`,
    });
    await notifyRole(tx, "ADMIN", {
      type: "INVOICE_APPROVAL",
      title: "Invoice awaiting approval",
      message: `${updated.number} (Rp ${Number(updated.grandTotal).toLocaleString("id-ID")}) was submitted by ${actor.name} and needs your approval before it's sent to the customer.`,
      link: `/finance/invoices/${id}`,
    });
    return updated;
  });

  await dispatchOutbound(
    { role: "ADMIN" },
    {
      title: "Invoice menunggu approval",
      message: `${invoice.number} (Rp ${Number(invoice.grandTotal).toLocaleString("id-ID")}) diajukan oleh ${actor.name} dan menunggu approval Anda sebelum dikirim ke customer.`,
      link: `/finance/invoices/${id}`,
    }
  ).catch((err) => console.error("[submitInvoiceForApproval] dispatchOutbound failed:", err));

  return invoice;
}

export async function approveInvoice(id: string, actor: SessionPayload) {
  const invoice = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({ where: { id } });
    requireInvoiceApprover(actor.role, actor.userId, existing.submittedById);
    if (existing.status !== "SUBMITTED") {
      throw new Error("Only a submitted invoice can be approved.");
    }
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "APPROVE", entityType: "INVOICE", entityId: id,
      description: `${updated.number}: Approved by ${actor.name}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "INVOICE_APPROVED",
        title: "Invoice approved",
        message: `${updated.number} has been approved and can now be issued to the customer.`,
        link: `/finance/invoices/${id}`,
      });
    }
    return updated;
  });

  if (invoice.submittedById) {
    await dispatchOutbound(
      { userId: invoice.submittedById },
      { title: "Invoice disetujui", message: `${invoice.number} telah disetujui dan siap diterbitkan ke customer.`, link: `/finance/invoices/${id}` }
    ).catch((err) => console.error("[approveInvoice] dispatchOutbound failed:", err));
  }

  return invoice;
}

export async function rejectInvoice(id: string, reason: string, actor: SessionPayload) {
  const invoice = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({ where: { id } });
    requireInvoiceApprover(actor.role, actor.userId, existing.submittedById);
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "REJECTED", isLocked: false, rejectedAt: new Date(), rejectedById: actor.userId, rejectionReason: reason },
    });
    await logActivity(tx, {
      userId: actor.userId, action: "REJECT", entityType: "INVOICE", entityId: id,
      description: `${updated.number}: Rejected - ${reason}`,
    });
    if (existing.submittedById) {
      await notifyUser(tx, {
        userId: existing.submittedById,
        type: "INVOICE_REJECTED",
        title: "Invoice rejected",
        message: `${updated.number} was rejected: ${reason}`,
        link: `/finance/invoices/${id}`,
      });
    }
    return updated;
  });

  if (invoice.submittedById) {
    await dispatchOutbound(
      { userId: invoice.submittedById },
      { title: "Invoice ditolak", message: `${invoice.number} ditolak: ${reason}`, link: `/finance/invoices/${id}` }
    ).catch((err) => console.error("[rejectInvoice] dispatchOutbound failed:", err));
  }

  return invoice;
}

/** Approved -> Issued (invoice actually sent/handed to the customer). */
export async function markInvoiceIssued(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "APPROVED") {
      throw new Error("Only an approved invoice can be marked as issued.");
    }
    const updated = await tx.invoice.update({ where: { id }, data: { status: "ISSUED" } });
    await logActivity(tx, {
      userId: actor.userId, action: "STATUS_CHANGE", entityType: "INVOICE", entityId: id,
      description: `${updated.number}: Approved -> Issued to customer`,
    });
    return updated;
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
