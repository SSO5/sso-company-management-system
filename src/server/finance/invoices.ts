"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { invoiceSchema } from "@/lib/validation/finance";
import {
  createInvoice,
  submitInvoiceForApproval,
  approveInvoice,
  rejectInvoice,
  markInvoiceIssued,
} from "@/lib/workflows/finance";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { revalidatePath } from "next/cache";

export async function listInvoices() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  return prisma.invoice.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, project: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvoice(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  return prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: {
      customer: true, project: { select: { id: true, number: true } },
      contact: { select: { id: true, name: true } },
      salesPic: { select: { id: true, name: true } },
      items: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { paymentDate: "desc" } },
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
    },
  });
}

export async function createInvoiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "create");
    const data = invoiceSchema.parse(input);
    const invoice = await createInvoice(data, actor);
    revalidatePath("/finance/invoices");
    return { id: invoice.id };
  });
}

export async function submitInvoiceAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "update");
    await submitInvoiceForApproval(id, actor);
    revalidatePath(`/finance/invoices/${id}`);
    return { id };
  });
}

export async function approveInvoiceAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await approveInvoice(id, actor);
    revalidatePath(`/finance/invoices/${id}`);
    return { id };
  });
}

export async function rejectInvoiceAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await rejectInvoice(id, reason, actor);
    revalidatePath(`/finance/invoices/${id}`);
    return { id };
  });
}

export async function markInvoiceIssuedAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "update");
    await markInvoiceIssued(id, actor);
    revalidatePath(`/finance/invoices/${id}`);
    return { id };
  });
}
