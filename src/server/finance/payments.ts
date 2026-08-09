"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { paymentSchema } from "@/lib/validation/finance";
import { recordPayment } from "@/lib/workflows/finance";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function listPayments() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  return prisma.payment.findMany({
    where: { deletedAt: null },
    include: { invoice: { select: { number: true } }, customer: { select: { companyName: true } } },
    orderBy: { paymentDate: "desc" },
  });
}

export async function recordPaymentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "create");
    const data = paymentSchema.parse(input);
    const payment = await recordPayment(data, actor);
    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${data.invoiceId}`);
    revalidatePath("/finance/receivables");
    return { id: payment.id };
  });
}
