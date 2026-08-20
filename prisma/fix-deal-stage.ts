/**
 * One-off remediation tool for the "deal stage got out of sync" case (spec:
 * "Perbaikan Deal Stage & Revisi Costing-Quotation" — the Nusa Cipta Sarana
 * / NCS deal specifically). Read-only diagnostic by default; only reverts
 * an Opportunity's status from WON back to NEGOTIATION, and only after an
 * explicit confirmation, because that field change alone is safe and
 * mechanical (the bug fixed in this same change set was a plain stage
 * picker being able to set WON without going through markQuotationWon —
 * see src/server/sales/opportunities.ts).
 *
 * This script deliberately does NOT try to auto-merge two separate
 * Quotation records into one, or touch any Project/Invoice/Task already
 * generated. Merging document numbers, or archiving records already shown
 * to a customer, is a document-control decision only a human on the deal
 * can make correctly — the script just surfaces everything needed to make
 * that call, and tells you what to do next.
 *
 * Usage:  npx tsx prisma/fix-deal-stage.ts "opportunity number, name, or customer name"
 * Matches case-insensitively/partially. If more than one Opportunity
 * matches, nothing happens — rerun with the exact number shown.
 */
import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";

const prisma = new PrismaClient();

async function main() {
  const query = process.argv[2]?.trim();
  if (!query) {
    console.error('Usage: npx tsx prisma/fix-deal-stage.ts "opportunity number, name, or customer name"');
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
    prisma.quotation.findMany({
      where: { opportunityId: opp.id, deletedAt: null },
      select: { id: true, number: true, revision: true, status: true, grandTotal: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.costingSheet.findMany({
      where: { opportunityId: opp.id, deletedAt: null },
      select: { id: true, number: true, revision: true, status: true, quotationId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: { opportunityId: opp.id },
      select: { id: true, number: true, createdAt: true },
    }),
  ]);

  console.log(`\nOpportunity ${opp.number} — "${opp.name}" (${opp.customer.companyName})`);
  console.log(`  Status: ${opp.status}`);

  console.log(`\nQuotations (${quotations.length}):`);
  if (quotations.length === 0) console.log("  (none)");
  quotations.forEach((q) => {
    const display = q.revision > 0 ? `${q.number}.R${q.revision}` : q.number;
    console.log(`  - ${display}  [${q.status}]  Rp ${Number(q.grandTotal).toLocaleString("id-ID")}  created ${q.createdAt.toISOString().slice(0, 10)}`);
  });

  console.log(`\nCosting sheets (${costingSheets.length}):`);
  if (costingSheets.length === 0) console.log("  (none)");
  costingSheets.forEach((c) => {
    const display = c.revision > 0 ? `${c.number}.R${c.revision}` : c.number;
    const linked = c.quotationId ? quotations.find((q) => q.id === c.quotationId)?.number ?? c.quotationId : "—";
    console.log(`  - ${display}  [${c.status}]  -> quotation: ${linked}  created ${c.createdAt.toISOString().slice(0, 10)}`);
  });

  console.log(`\nProjects generated from this deal (${projects.length}):`);
  if (projects.length === 0) console.log("  (none)");
  projects.forEach((p) => console.log(`  - ${p.number}  created ${p.createdAt.toISOString().slice(0, 10)}`));

  const openQuotations = quotations.filter((q) => q.status !== "WON" && q.status !== "LOST");
  if (openQuotations.length > 1) {
    console.log(
      `\n⚠ ${openQuotations.length} quotations are still open on this deal at once. If this deal should really\n` +
        `  only have one live quotation, decide which one is canonical, then re-run the newer costing\n` +
        `  sheet(s) through "Convert to Quotation" -> "Ya, Jadikan Revisi" against that quotation from\n` +
        `  the app UI (this script won't merge them automatically — that's a document-control decision).`
    );
  }

  if (opp.status !== "WON") {
    console.log(`\nOpportunity status is "${opp.status}", not WON — nothing to revert. Exiting.`);
    return;
  }

  if (projects.length > 0) {
    console.log(
      `\n⚠ This deal already has ${projects.length} Project(s) generated from it. Reverting the stage below does\n` +
        `  NOT touch those — if they were created in error (deal isn't really Won), archive/soft-delete them\n` +
        `  separately and deliberately; this script only fixes the Opportunity's stage field.`
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nRevert ${opp.number}'s stage from WON back to NEGOTIATION? Type YES (all caps) to confirm, anything else to cancel: `
  );
  rl.close();
  if (answer !== "YES") {
    console.log("Cancelled — no changes made.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({ where: { id: opp.id }, data: { status: "NEGOTIATION" } });
    await tx.activityLog.create({
      data: {
        action: "STATUS_CHANGE",
        entityType: "OPPORTUNITY",
        entityId: opp.id,
        description: `${opp.number}: WON -> NEGOTIATION (manual correction via prisma/fix-deal-stage.ts — stage had been set directly instead of through Mark Won)`,
      },
    });
  });

  console.log(`Done — ${opp.number} is back to NEGOTIATION.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
