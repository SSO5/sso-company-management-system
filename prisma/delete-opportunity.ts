/**
 * One-off maintenance tool: permanently deletes ONE Opportunity "card" and
 * everything that hangs directly off it — its Quotations (+items), Costing
 * Sheets (+sections/items), the Project it may have spawned if it was marked
 * Won (+that project's tasks/milestones/expenses), any Purchase Orders /
 * Contracts / Invoices / Payments tied to those, its Folder tree, and its
 * Documents.
 *
 * Unlike prisma/delete-customer.ts, this does NOT touch the Customer or
 * Contact record — only the Opportunity and what was generated from it. Use
 * this for "I only tested one deal for a real/existing customer and want
 * that trial deal gone, but the customer record itself should stay."
 *
 * Hard delete, not the app's usual soft-delete — for cleaning up test data
 * only. All-or-nothing (one transaction). Document numbers already issued
 * stay burned (never reused), matching the app's numbering policy.
 *
 * Usage:  npx tsx prisma/delete-opportunity.ts "marina bara"
 * Matches against the Opportunity number, its name/subject, or its
 * customer's company name (case-insensitive, partial). If more than one
 * Opportunity matches, nothing is deleted — rerun with the exact
 * Opportunity number shown in the list instead (e.g. "OPP/MKT/...").
 */
import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";

const prisma = new PrismaClient();

async function main() {
  const query = process.argv[2]?.trim();
  if (!query) {
    console.error('Usage: npx tsx prisma/delete-opportunity.ts "opportunity number, name, or customer name"');
    process.exit(1);
  }

  const matches = await prisma.opportunity.findMany({
    where: {
      OR: [
        { number: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { customer: { companyName: { contains: query, mode: "insensitive" } } },
      ],
    },
    include: { customer: { select: { companyName: true } } },
  });

  if (matches.length === 0) {
    console.log(`No opportunity found matching "${query}". Nothing to do.`);
    return;
  }
  if (matches.length > 1) {
    console.log(`${matches.length} opportunities match "${query}" — rerun with the exact number below:`);
    matches.forEach((o) => console.log(`  - ${o.number}  "${o.name}"  (${o.customer.companyName})  [${o.status}]`));
    return;
  }

  const opp = matches[0];
  const [quotations, costingSheets, projects] = await Promise.all([
    prisma.quotation.findMany({ where: { opportunityId: opp.id }, select: { id: true, number: true } }),
    prisma.costingSheet.findMany({ where: { opportunityId: opp.id }, select: { id: true, number: true } }),
    prisma.project.findMany({ where: { opportunityId: opp.id }, select: { id: true, number: true } }),
  ]);
  const quotationIds = quotations.map((q) => q.id);
  const costingIds = costingSheets.map((c) => c.id);
  const projectIds = projects.map((p) => p.id);

  const [purchaseOrders, contracts, invoices, folders] = await Promise.all([
    prisma.purchaseOrder.findMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] }, select: { id: true, number: true } }),
    prisma.contract.findMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] }, select: { id: true, number: true } }),
    prisma.invoice.findMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] }, select: { id: true, number: true } }),
    prisma.folder.findMany({ where: { OR: [{ opportunityId: opp.id }, { projectId: { in: projectIds } }] }, select: { id: true } }),
  ]);
  const invoiceIds = invoices.map((i) => i.id);
  const folderIds = folders.map((f) => f.id);
  const payments = await prisma.payment.findMany({
    where: { OR: [{ invoiceId: { in: invoiceIds } }, { projectId: { in: projectIds } }] },
    select: { id: true, number: true },
  });
  const documentCount = await prisma.document.count({
    where: {
      OR: [
        { folderId: { in: folderIds } },
        { relatedEntityId: { in: [opp.id, ...quotationIds, ...costingIds, ...projectIds] } },
      ],
    },
  });

  console.log(`\nAbout to PERMANENTLY delete Opportunity card:`);
  console.log(`  Opportunity:     ${opp.number} — "${opp.name}" (${opp.customer.companyName}) [${opp.status}]`);
  console.log(`  Quotations:      ${quotations.length} ${quotations.map((q) => q.number).join(", ")}`);
  console.log(`  Costing Sheets:  ${costingSheets.length} ${costingSheets.map((c) => c.number).join(", ")}`);
  console.log(`  Projects:        ${projects.length} ${projects.map((p) => p.number).join(", ")} ${projects.length ? "(this deal was marked Won — its Project, tasks, and folders go too)" : ""}`);
  console.log(`  Purchase Orders: ${purchaseOrders.length}`);
  console.log(`  Contracts:       ${contracts.length}`);
  console.log(`  Invoices:        ${invoices.length}`);
  console.log(`  Payments:        ${payments.length}`);
  console.log(`  Folders:         ${folderIds.length}`);
  console.log(`  Documents:       ${documentCount}`);
  console.log(`\n  Customer "${opp.customer.companyName}" itself is NOT deleted — only this Opportunity and what came from it.`);
  console.log(`This cannot be undone. Document numbers already issued stay burned (not reused).`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nType DELETE (all caps) to confirm, anything else to cancel: ');
  rl.close();
  if (answer !== "DELETE") {
    console.log("Cancelled — nothing was deleted.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { OR: [{ invoiceId: { in: invoiceIds } }, { projectId: { in: projectIds } }] } });
    await tx.invoice.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] } }); // cascades InvoiceItem
    await tx.contract.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] } });
    await tx.purchaseOrder.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { quotationId: { in: quotationIds } }] } });
    await tx.document.deleteMany({
      where: {
        OR: [
          { folderId: { in: folderIds } },
          { relatedEntityId: { in: [opp.id, ...quotationIds, ...costingIds, ...projectIds] } },
        ],
      },
    });
    await tx.costingSheet.deleteMany({ where: { opportunityId: opp.id } }); // cascades sections/items
    await tx.project.deleteMany({ where: { opportunityId: opp.id } }); // cascades tasks/milestones/expenses/folders
    await tx.quotation.deleteMany({ where: { opportunityId: opp.id } }); // cascades QuotationItem
    await tx.folder.deleteMany({ where: { opportunityId: opp.id } }); // the opportunity's own pre-Won folder tree
    await tx.activityLog.deleteMany({ where: { entityId: { in: [opp.id, ...quotationIds, ...costingIds, ...projectIds] } } });
    await tx.opportunity.delete({ where: { id: opp.id } });
  }, { timeout: 20000, maxWait: 10000 });

  console.log(`\nDone — Opportunity ${opp.number} and everything generated from it has been permanently deleted. Customer "${opp.customer.companyName}" was left untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
