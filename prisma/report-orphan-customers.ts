/**
 * Read-only report (no deletes): lists every Customer that has ZERO
 * Opportunities linked to it — the likely "incomplete / test" entries
 * cluttering the Customer picker in Costing and Quotation forms, per the
 * request to "reset nama-nama yang tidak ada dalam opportunity."
 *
 * This does NOT delete anything. Review the list, then tell me which rows
 * are safe to remove (or re-run the existing prisma/delete-customer.ts for
 * each one you confirm) — deleting customer records is deliberately kept as
 * a separate, explicit step so nothing real gets removed by accident.
 *
 * Usage:  npx tsx prisma/report-orphan-customers.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function completeness(c: { address: string | null; city: string | null; phone: string | null; email: string | null; taxId: string | null }) {
  const fields = [c.address, c.city, c.phone, c.email, c.taxId];
  const filled = fields.filter(Boolean).length;
  return `${filled}/${fields.length} fields filled`;
}

async function main() {
  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { opportunities: true, quotations: true, costingSheets: true, contacts: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const orphans = customers.filter((c) => c._count.opportunities === 0);
  const withOpp = customers.length - orphans.length;

  console.log(`Total customers: ${customers.length}`);
  console.log(`  With at least 1 Opportunity: ${withOpp}`);
  console.log(`  With ZERO Opportunities (candidates for cleanup): ${orphans.length}\n`);

  if (orphans.length === 0) {
    console.log("Nothing to clean up — every Customer has at least one Opportunity.");
    return;
  }

  console.log("Customers with no Opportunity:");
  for (const c of orphans) {
    console.log(
      `  - ${c.number}  "${c.companyName}"  [${c.customerType}/${c.status}]  ` +
      `data: ${completeness(c)}  ` +
      `(${c._count.contacts} contact, ${c._count.quotations} quotation, ${c._count.costingSheets} costing)`
    );
  }

  console.log(
    "\nTo delete one of these (and its Contacts — nothing else, since it has no Opportunity/Quotation/etc.), " +
    "use:  npx tsx prisma/delete-customer.ts \"<part of the company name>\""
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
