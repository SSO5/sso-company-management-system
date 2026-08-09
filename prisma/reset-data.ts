import type { PrismaClient } from "@prisma/client";

/**
 * Wipe transactional data so re-running seed.ts never doubles up old rows
 * with real ones, and so db:reset can clear the pipeline without reseeding
 * anything back in. Deleted in FK-safe (children-first) order. Users,
 * CompanySettings, and COMPANY-kind folders are never touched by this.
 *
 * Kept in its own module (not inline in seed.ts) so prisma/reset.ts can
 * import just this function without triggering seed.ts's own `main()` —
 * importing a file with a top-level `main().catch(...)` call would run the
 * whole reseed as a side effect, which is exactly what db:reset must avoid.
 */
export async function resetTransactionalData(prisma: PrismaClient) {
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({}); // cascades InvoiceItem
  await prisma.projectExpense.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.folder.deleteMany({ where: { kind: { in: ["PROJECT", "OPPORTUNITY"] } } }); // cascades children
  await prisma.purchaseOrder.deleteMany({});
  await prisma.contract.deleteMany({});
  await prisma.costingSheet.deleteMany({}); // cascades CostingSection/CostingLineItem
  await prisma.project.deleteMany({}); // cascades ProjectTask/ProjectMilestone
  await prisma.quotation.deleteMany({}); // cascades QuotationItem
  await prisma.opportunity.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.numberRegistryEntry.deleteMany({});
  await prisma.registryNumberSequence.deleteMany({});
  await prisma.numberSequence.deleteMany({});
}
