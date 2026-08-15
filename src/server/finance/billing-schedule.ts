"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { computeBillingSchedule, type BillingScheduleRow } from "@/lib/workflows/calculations";
import { refreshBillingSchedule } from "@/lib/workflows/finance";

/**
 * Company-wide "what's left to bill, and roughly when" — one query, reused
 * everywhere the founder wanted this visible (Accounts Receivable, Invoices,
 * Payments, Dashboard) instead of the per-project-only version that used to
 * live solely on a project's Documents tab. See computeBillingSchedule for
 * the actual math and why it's per-project rather than per-PO.
 */
export async function getBillingSchedule(): Promise<BillingScheduleRow[]> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "finance", "view");
  await refreshBillingSchedule();

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

  return computeBillingSchedule(projects);
}
