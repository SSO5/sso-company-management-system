"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { invoiceSchema } from "@/lib/validation/finance";
import { createInvoice } from "@/lib/workflows/finance";
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
      items: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { paymentDate: "desc" } },
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
