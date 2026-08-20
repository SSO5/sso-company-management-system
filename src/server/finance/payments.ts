"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { paymentSchema } from "@/lib/validation/finance";
import { recordPayment } from "@/lib/workflows/finance";
import { uploadDocument } from "@/lib/workflows/documents";
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

/**
 * Takes the raw FormData straight from RecordPaymentDialog (not a plain
 * object like most actions here) because it now carries the bukti transfer
 * file alongside the typed fields — a real proof-of-payment upload is
 * required before a Payment can be recorded at all (spec: "evidence before
 * the system treats something as done", same rule as PO-before-Won).
 */
export async function recordPaymentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "finance", "create");
    requirePermission(actor.role, "documents", "create");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Upload bukti transfer (foto/PDF) terlebih dahulu.");

    const fields = Object.fromEntries(formData.entries());
    delete (fields as Record<string, unknown>).file;
    const data = paymentSchema.parse(fields);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: data.invoiceId }, select: { projectId: true } });

    const doc = await uploadDocument(
      {
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        projectId: invoice.projectId,
        relatedEntityType: "PAYMENT",
      },
      actor
    );

    const payment = await recordPayment(data, doc.id, actor);
    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${data.invoiceId}`);
    revalidatePath("/finance/receivables");
    revalidatePath("/finance/payments");
    if (invoice.projectId) revalidatePath(`/projects/${invoice.projectId}`);
    return { id: payment.id };
  });
}
