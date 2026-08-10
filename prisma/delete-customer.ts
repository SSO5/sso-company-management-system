/**
 * One-off maintenance tool: permanently deletes ONE Customer and everything
 * hanging off it (Contacts, Leads, Opportunities, Quotations + items, Costing
 * Sheets + sections/items, Purchase Orders, Contracts, Projects + their
 * tasks/milestones/expenses/folders, Invoices + items, Payments, Documents,
 * and the matching Folder trees) — for cleaning up a trial/test entry made
 * while exploring the app, WITHOUT wiping the rest of the real pipeline data
 * (unlike db:reset, which clears everything).
 *
 * This is a genuine hard delete (not the app's usual soft-delete pattern) —
 * meant for test/trial data only. Do not run this against a customer with
 * real transactional history you might need later; use the app's own
 * "Mark Lost" / archive features for that instead.
 *
 * Deletes children before parents, in FK-safe order, all inside one
 * transaction (all-or-nothing). Number sequences are intentionally left
 * untouched — this app never reuses a burned document number, even for
 * deleted trial data.
 *
 * Usage:  npx tsx prisma/delete-customer.ts "marina bara lestari"
 * (matches company name case-insensitively; if more than one Customer
 * matches, nothing is deleted — narrow the search text instead.)
 */
import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";

const prisma = new PrismaClient();

async function main() {
  const query = process.argv[2]?.trim();
  if (!query) {
    console.error('Usage: npx tsx prisma/delete-customer.ts "customer name or part of it"');
    process.exit(1);
  }

  const matches = await prisma.customer.findMany({
    where: { companyName: { contains: query, mode: "insensitive" } },
  });

  if (matches.length === 0) {
    console.log(`No customer found matching "${query}". Nothing to do.`);
    return;
  }
  if (matches.length > 1) {
    console.log(`${matches.length} customers match "${query}" — be more specific. Matches:`);
    matches.forEach((c) => console.log(`  - ${c.companyName} (${c.number})`));
    return;
  }

  const customer = matches[0];
  const [opportunities, projects, quotations, costingSheets, contacts, purchaseOrders, contracts, invoices, payments] =
    await Promise.all([
      prisma.opportunity.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.project.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.quotation.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.costingSheet.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.contact.findMany({ where: { customerId: customer.id }, select: { id: true, name: true } }),
      prisma.purchaseOrder.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.contract.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.invoice.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
      prisma.payment.findMany({ where: { customerId: customer.id }, select: { id: true, number: true } }),
    ]);
  const opportunityIds = opportunities.map((o) => o.id);
  const projectIds = projects.map((p) => p.id);
  const quotationIds = quotations.map((q) => q.id);
  const costingIds = costingSheets.map((c) => c.id);

  const folders = await prisma.folder.findMany({
    where: { OR: [{ opportunityId: { in: opportunityIds } }, { projectId: { in: projectIds } }] },
    select: { id: true },
  });
  const folderIds = folders.map((f) => f.id);
  const documentCount = await prisma.document.count({
    where: {
      OR: [
        { folderId: { in: folderIds } },
        { relatedEntityId: { in: [customer.id, ...opportunityIds, ...projectIds, ...quotationIds, ...costingIds] } },
      ],
    },
  });

  console.log(`\nAbout to PERMANENTLY delete:`);
  console.log(`  Customer:        ${customer.companyName} (${customer.number})`);
  console.log(`  Contacts:        ${contacts.length}`);
  console.log(`  Opportunities:   ${opportunities.length} ${opportunities.map((o) => o.number).join(", ")}`);
  console.log(`  Projects:        ${projects.length} ${projects.map((p) => p.number).join(", ")}`);
  console.log(`  Quotations:      ${quotations.length} ${quotations.map((q) => q.number).join(", ")}`);
  console.log(`  Costing Sheets:  ${costingSheets.length} ${costingSheets.map((c) => c.number).join(", ")}`);
  console.log(`  Purchase Orders: ${purchaseOrders.length}`);
  console.log(`  Contracts:       ${contracts.length}`);
  console.log(`  Invoices:        ${invoices.length}`);
  console.log(`  Payments:        ${payments.length}`);
  console.log(`  Folders:         ${folderIds.length}`);
  console.log(`  Documents:       ${documentCount}`);
  console.log(`\nThis cannot be undone. Document numbers already issued stay burned (not reused).`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nType DELETE (all caps) to confirm, anything else to cancel: ');
  rl.close();
  if (answer !== "DELETE") {
    console.log("Cancelled — nothing was deleted.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { OR: [{ customerId: customer.id }, { projectId: { in: projectIds } }] } });
    await tx.invoice.deleteMany({ where: { OR: [{ customerId: customer.id }, { projectId: { in: projectIds } }] } }); // cascades InvoiceItem
    await tx.contract.deleteMany({
      where: { OR: [{ customerId: customer.id }, { projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] },
    });
    await tx.purchaseOrder.deleteMany({
      where: { OR: [{ customerId: customer.id }, { projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] },
    });
    await tx.document.deleteMany({
      where: {
        OR: [
          { folderId: { in: folderIds } },
          { relatedEntityId: { in: [customer.id, ...opportunityIds, ...projectIds, ...quotationIds, ...costingIds] } },
        ],
      },
    });
    await tx.folder.deleteMany({ where: { OR: [{ opportunityId: { in: opportunityIds } }, { projectId: { in: projectIds } }] } });
    await tx.costingSheet.deleteMany({ where: { customerId: customer.id } }); // cascades sections/items
    await tx.project.deleteMany({ where: { customerId: customer.id } }); // cascades tasks/milestones/expenses
    await tx.quotation.deleteMany({ where: { customerId: customer.id } }); // cascades QuotationItem
    await tx.opportunity.deleteMany({ where: { customerId: customer.id } });
    await tx.lead.deleteMany({ where: { customerId: customer.id } });
    await tx.contact.deleteMany({ where: { customerId: customer.id } });
    await tx.activityLog.deleteMany({
      where: { entityId: { in: [customer.id, ...opportunityIds, ...projectIds, ...quotationIds, ...costingIds] } },
    });
    await tx.customer.delete({ where: { id: customer.id } });
  }, { timeout: 20000, maxWait: 10000 });

  console.log(`\nDone — "${customer.companyName}" and everything under it has been permanently deleted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
