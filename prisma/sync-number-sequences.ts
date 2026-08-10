/**
 * One-off maintenance tool: fixes "Unique constraint failed on the fields:
 * (`number`)" errors by re-syncing every NumberSequence counter to the
 * highest number ACTUALLY in use right now, per entity type per year.
 *
 * Why this happens: prisma/seed.ts inserts some real historical records
 * (e.g. quotations "002/QUO/MKT/V/2026", "003/QUO/MKT/VI/2026",
 * "005/QUO/MKT/V/2026" — real deals issued before this system existed)
 * DIRECTLY with their real-world number, bypassing generateNumber() —
 * so NumberSequence's counter never learns those numbers were taken.
 * The next time the app calls generateNumber() for that entity type, it has
 * no idea "002" or "003" are already burned and hands them out again ->
 * unique constraint violation the moment that number is actually saved.
 * Manually editing NumberSequence.currentNumber in Prisma Studio (as done
 * earlier for Quotation/Opportunity/Costing) only treats the symptom for
 * ONE entity type at a time and is easy to get wrong in the same way.
 *
 * This script is the permanent fix: for every entity type that has a real
 * table (Customer, Lead, Opportunity, Quotation, PurchaseOrder, Contract,
 * Project, Invoice, Payment, ProjectExpense, CostingSheet, VendorPurchaseOrder),
 * it scans every row's `number` column (including soft-deleted rows — a
 * deletedAt record still occupies that number at the database level),
 * extracts the leading sequence digits and the trailing year from the
 * "{seq}/{prefix.../}{year}" format, and sets NumberSequence.currentNumber
 * to the highest sequence found per (entityType, year) — but only ever
 * RAISES it, never lowers it, so it's always safe to re-run.
 *
 * Usage:  npx tsx prisma/sync-number-sequences.ts
 *         npx tsx prisma/sync-number-sequences.ts --dry-run   (report only, no writes)
 */
import { PrismaClient, type NumberEntityType } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

// { entityType, human label, the rows to scan }
const SOURCES: { entityType: NumberEntityType; label: string; fetch: () => Promise<{ number: string }[]> }[] = [
  { entityType: "CUSTOMER", label: "Customer", fetch: () => prisma.customer.findMany({ select: { number: true } }) },
  { entityType: "LEAD", label: "Lead", fetch: () => prisma.lead.findMany({ select: { number: true } }) },
  { entityType: "OPPORTUNITY", label: "Opportunity", fetch: () => prisma.opportunity.findMany({ select: { number: true } }) },
  { entityType: "QUOTATION", label: "Quotation", fetch: () => prisma.quotation.findMany({ select: { number: true } }) },
  { entityType: "PURCHASE_ORDER", label: "Purchase Order (customer)", fetch: () => prisma.purchaseOrder.findMany({ select: { number: true } }) },
  { entityType: "CONTRACT", label: "Contract", fetch: () => prisma.contract.findMany({ select: { number: true } }) },
  { entityType: "PROJECT", label: "Project", fetch: () => prisma.project.findMany({ select: { number: true } }) },
  { entityType: "INVOICE", label: "Invoice", fetch: () => prisma.invoice.findMany({ select: { number: true } }) },
  { entityType: "PAYMENT", label: "Payment", fetch: () => prisma.payment.findMany({ select: { number: true } }) },
  { entityType: "EXPENSE", label: "Project Expense", fetch: () => prisma.projectExpense.findMany({ select: { number: true } }) },
  { entityType: "COSTING", label: "Costing Sheet", fetch: () => prisma.costingSheet.findMany({ select: { number: true } }) },
  { entityType: "VENDOR_PO", label: "Vendor Purchase Order", fetch: () => prisma.vendorPurchaseOrder.findMany({ select: { number: true } }) },
];

// "004/QUO/MKT/VIII/2026" -> { seq: 4, year: 2026 }. Prefix itself may
// contain its own "/" (e.g. "QUO/MKT"), so we only ever trust the FIRST
// segment (sequence) and the LAST segment (year) — never a fixed index.
const NUMBER_PATTERN = /^(\d+)\/.+\/(\d{4})$/;

function parseNumber(raw: string): { seq: number; year: number } | null {
  const m = raw.trim().match(NUMBER_PATTERN);
  if (!m) return null;
  return { seq: parseInt(m[1], 10), year: parseInt(m[2], 10) };
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no changes will be written.\n" : "Syncing NumberSequence counters...\n");

  for (const source of SOURCES) {
    const rows = await source.fetch();
    const maxByYear = new Map<number, number>();
    const unparsed: string[] = [];

    for (const row of rows) {
      const parsed = parseNumber(row.number);
      if (!parsed) {
        unparsed.push(row.number);
        continue;
      }
      const current = maxByYear.get(parsed.year) ?? 0;
      if (parsed.seq > current) maxByYear.set(parsed.year, parsed.seq);
    }

    if (unparsed.length > 0) {
      console.log(`  [${source.label}] ${unparsed.length} number(s) didn't match the standard format, skipped: ${unparsed.slice(0, 5).join(", ")}${unparsed.length > 5 ? ", ..." : ""}`);
    }

    if (maxByYear.size === 0) {
      console.log(`${source.label}: no numbered records found, nothing to sync.`);
      continue;
    }

    for (const [year, maxSeq] of maxByYear) {
      const existing = await prisma.numberSequence.findUnique({
        where: { entityType_year: { entityType: source.entityType, year } },
      });

      if (existing && existing.currentNumber >= maxSeq) {
        console.log(`${source.label} ${year}: counter already at ${existing.currentNumber} (>= highest used ${maxSeq}). No change.`);
        continue;
      }

      console.log(
        `${source.label} ${year}: counter ${existing ? existing.currentNumber : "(none)"} -> ${maxSeq} ` +
        `(highest number actually in use this year)`
      );

      if (!DRY_RUN) {
        await prisma.numberSequence.upsert({
          where: { entityType_year: { entityType: source.entityType, year } },
          create: {
            entityType: source.entityType,
            year,
            prefix: existing?.prefix ?? source.entityType.slice(0, 3),
            currentNumber: maxSeq,
            padding: existing?.padding ?? 3,
          },
          update: { currentNumber: maxSeq },
        });
      }
    }
  }

  console.log(DRY_RUN ? "\nDry run complete — rerun without --dry-run to apply." : "\nDone. Every counter now starts strictly after the highest number already in use.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
