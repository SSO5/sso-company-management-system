/**
 * One-off maintenance tool: wipes ALL Invoice (+ items), Payment, and
 * ProjectExpense records so the Dashboard's financial KPIs (Total Revenue,
 * Outstanding Receivables, Gross Profit) go back to a clean Rp 0 baseline —
 * for when trial/testing invoices got created before any real transaction
 * ever happened, and you want the numbers to only reflect what you input
 * going forward.
 *
 * Does NOT touch: Customers, Opportunities, Quotations, Projects, Purchase
 * Orders, Contracts, Vendor Purchase Orders. Those stay exactly as they are
 * — this only clears the finance-side transaction records that feed
 * src/server/dashboard.ts's KPI math.
 *
 * Also resets the INVOICE, PAYMENT, and EXPENSE number counters (all years)
 * to 0, so the next real Invoice/Payment/Expense you create starts at 001
 * again instead of continuing from wherever the deleted trial records left
 * off.
 *
 * Hard delete, cannot be undone. Usage:
 *   npx tsx prisma/reset-financials.ts
 */
import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";

const prisma = new PrismaClient();

async function main() {
  const [invoices, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({
      select: { id: true, number: true, grandTotal: true, status: true, customer: { select: { companyName: true } } },
    }),
    prisma.payment.findMany({ select: { id: true, number: true, amount: true } }),
    prisma.projectExpense.findMany({ select: { id: true, number: true, total: true, description: true } }),
  ]);

  if (invoices.length === 0 && payments.length === 0 && expenses.length === 0) {
    console.log("No Invoice, Payment, or ProjectExpense records found — financials are already at zero. Nothing to do.");
    return;
  }

  console.log("\nAbout to PERMANENTLY delete ALL of the following:");
  console.log(`  Invoices (${invoices.length}):`);
  invoices.forEach((i) => console.log(`    - ${i.number}  ${i.customer.companyName}  Rp ${Number(i.grandTotal).toLocaleString("id-ID")}  [${i.status}]`));
  console.log(`  Payments (${payments.length}):`);
  payments.forEach((p) => console.log(`    - ${p.number}  Rp ${Number(p.amount).toLocaleString("id-ID")}`));
  console.log(`  Project Expenses (${expenses.length}):`);
  expenses.forEach((e) => console.log(`    - ${e.number}  ${e.description}  Rp ${Number(e.total).toLocaleString("id-ID")}`));
  console.log("\nCustomers, Opportunities, Quotations, Projects, and Purchase Orders are NOT touched.");
  console.log("This cannot be undone.");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nType RESET (all caps) to confirm, anything else to cancel: ');
  rl.close();
  if (answer !== "RESET") {
    console.log("Cancelled — nothing was deleted.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({});
    await tx.invoice.deleteMany({}); // cascades InvoiceItem
    await tx.projectExpense.deleteMany({});
    await tx.numberSequence.updateMany({ where: { entityType: "INVOICE" }, data: { currentNumber: 0 } });
    await tx.numberSequence.updateMany({ where: { entityType: "PAYMENT" }, data: { currentNumber: 0 } });
    await tx.numberSequence.updateMany({ where: { entityType: "EXPENSE" }, data: { currentNumber: 0 } });
  }, { timeout: 20000, maxWait: 10000 });

  console.log("\nDone. Invoices, Payments, and Project Expenses are cleared, and their number counters are back to 0.");
  console.log("Dashboard KPIs (Total Revenue, Outstanding Receivables, Gross Profit) will now show Rp 0 until you create real records.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
