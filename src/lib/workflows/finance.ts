import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { notifyRole, notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { calcInvoiceTotals, invoiceDueAmount, computeBillingSchedule } from "@/lib/workflows/calculations";
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
/**
 * `documentId` is the bukti transfer Document already uploaded by
 * recordPaymentAction (server/finance/payments.ts) before this runs — a
 * real proof-of-payment file is required for every Payment now, not just
 * typed-in amount/date/reference (spec: same "evidence before the system
 * treats something as done" rule as the customer-PO-before-Won gate). Once
 * the Payment row exists, its id is written back onto that Document
 * (relatedEntityId) so it's traceable both ways.
 */
export async function recordPayment(input: PaymentInput, documentId: string, actor: SessionPayload) {
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

    await tx.document.update({ where: { id: documentId }, data: { relatedEntityId: payment.id } });

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

/**
 * Same idea as refreshOverdueInvoices, for the "next billing stage" concept
 * built for the Documents tab (Aug 2026) — surfaces it as a real
 * notification instead of something only visible to whoever happens to open
 * a specific project's Documents tab. Runs on every load of a page that
 * calls getBillingSchedule() (receivables, invoices, payments, dashboard),
 * same "batch job safe to call on page load" pattern as overdue invoices —
 * there is no real cron in this deployment.
 *
 * De-duped by checking for an existing BILLING_DUE_SOON notification that
 * already mentions this project's number within the last 3 days, since
 * (unlike overdue invoices) there's no status-transition to naturally
 * prevent re-notifying on every single page load.
 */
export async function refreshBillingSchedule() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      number: true,
      customer: { select: { companyName: true } },
      purchaseOrders: {
        where: { deletedAt: null },
        select: { id: true, number: true, poValue: true, status: true, paymentTerms: true, estimatedDeliveryDate: true },
      },
      invoices: { where: { deletedAt: null }, select: { grandTotal: true, dpPercent: true, status: true } },
    },
  });
  const schedule = computeBillingSchedule(projects);

  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const dueSoon = schedule.filter((r) => r.nextBillingDate && r.nextBillingDate <= in7Days);
  if (dueSoon.length === 0) return 0;

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let notifiedCount = 0;

  for (const row of dueSoon) {
    const alreadyNotified = await prisma.notification.findFirst({
      where: { type: "BILLING_DUE_SOON", message: { contains: row.projectNumber }, createdAt: { gt: threeDaysAgo } },
    });
    if (alreadyNotified) continue;

    const title = `Penagihan jatuh tempo: ${row.projectNumber}`;
    const message = `${row.customerName} — sisa Rp ${row.remainingToBill.toLocaleString("id-ID")} dari project ${row.projectNumber}, target ${
      row.nextBillingDate ? row.nextBillingDate.toLocaleDateString("id-ID") : "-"
    }.`;
    const link = "/finance/receivables";

    await prisma.$transaction((tx) => notifyRole(tx, "FINANCE", { type: "BILLING_DUE_SOON", title, message, link }));
    await dispatchOutbound({ role: "FINANCE" }, { title, message, link }).catch((err) =>
      console.error("[refreshBillingSchedule] dispatchOutbound failed:", err)
    );
    notifiedCount++;
  }

  return notifiedCount;
}
