/**
 * Wipes all transactional pipeline data (Customers, Contacts, Leads,
 * Opportunities, Quotations, Costing Sheets, Purchase Orders, Contracts,
 * Projects, Invoices, Payments, Documents, and non-company Folders) WITHOUT
 * reseeding the PROSPEK 2026 demo companies back in — unlike `db:seed`,
 * which wipes then immediately reseeds real pipeline data.
 *
 * Use this when you want a genuinely empty pipeline to manually walk through
 * the whole Sales -> Costing -> Quotation -> Won -> Project flow yourself
 * from a blank slate, to find any gaps in the real workflow.
 *
 * Users, CompanySettings (company name/address/logo/stamp/numbering
 * prefixes), and COMPANY-kind folders are all preserved — you keep your
 * logins and company profile, only job/pipeline data is cleared.
 *
 * Number sequences are also reset to 0, so the very next Customer/
 * Opportunity/Quotation/etc. you create will start again from 001 — safe
 * only because this wipes the real records those numbers were attached to
 * at the same time. Do NOT run this once you have real, hand-entered
 * production data you intend to keep.
 *
 * Run with: npm run db:reset
 */
import { PrismaClient } from "@prisma/client";
import { resetTransactionalData } from "./reset-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Wiping all transactional pipeline data (Users & CompanySettings preserved)...");
  await resetTransactionalData(prisma);
  console.log("Done. Pipeline is empty — Customers/Opportunities/Quotations/Costing/PO/Contracts/Projects/Invoices/Payments/Documents all cleared.");
  console.log("Users, company profile, and numbering prefixes are untouched. Number counters reset to 0 (next number issued will be 001).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
