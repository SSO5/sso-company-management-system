/**
 * Real pipeline data (replaces the earlier placeholder/demo dataset).
 *
 * Sourced directly from the user's own working folder
 * "PROSPEK 2026" (Customer names, quotation numbers, contract values, job
 * numbers, and contact names below are all taken from real SSO documents —
 * quotation PDFs and the "Pembukuan_SSO_Integrated_Financial_Model_v4.xlsx"
 * job-costing sheet — not invented). Detailed costing-sheet line items and
 * financial transactions (invoices/payments/expenses) are intentionally
 * NOT reconstructed here to avoid guessing numbers that weren't clearly
 * evidenced; add those live in the app, or ask for a follow-up import pass.
 *
 * Uses the same workflow functions the real app calls (submit -> approve ->
 * Won) so the seed doubles as an end-to-end smoke test of the Won-deal
 * automation, the folder-migration cascade, and the numbering engine.
 *
 * Run with: npm run db:seed  (or automatically after `prisma migrate dev`)
 *
 * WARNING: this script WIPES all Customer/Contact/Lead/Opportunity/
 * Quotation/CostingSheet/PurchaseOrder/Contract/Project/Invoice/Payment/
 * Document/Folder(non-company) data before reseeding. Users and
 * CompanySettings are preserved. Do not run this against a database that
 * already has real, hand-entered production data you want to keep.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { generateNumber } from "../src/lib/numbering";
import { ensureCompanyFolders, createOpportunityFolders } from "../src/lib/workflows/folders";
import { submitQuotationForApproval, approveQuotation, markQuotationWon } from "../src/lib/workflows/quotation";
import { calcQuotationTotals } from "../src/lib/workflows/calculations";
import { DEFAULT_COMMERCIAL_TERMS } from "../src/lib/validation/sales";
import { resetTransactionalData } from "./reset-data";
import type { SessionPayload } from "../src/lib/auth/session";
import type { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function actorOf(u: { id: string; email: string; name: string; role: SessionPayload["role"] }): SessionPayload {
  return { userId: u.id, email: u.email, name: u.name, role: u.role };
}

/** Create a Quotation with an explicit, already-issued number (bypassing
 * generateNumber) — used only for real quotations that were already issued
 * in the real world before this system existed. The NumberSequence counter
 * is advanced separately in main() so future auto-generated numbers never
 * collide with these. */
async function createRealQuotation(input: {
  number: string;
  customerId: string;
  contactId?: string;
  opportunityId: string;
  salesPicId: string;
  quotationDate: Date;
  subjectLine: string;
  itemName: string;
  amount: number;
  /** Real issued quotations found revision suffixes in their own filenames/
   * PDFs (e.g. "003_QUO_MKT_VI_2026...R2.pdf", "005/QUO/MKT/V/2026.R2" seen
   * in the app's own generated PDF) — reflect that here instead of seeding
   * them as if they were still the original R0 version. */
  revision?: number;
}, actor: SessionPayload) {
  const totals = calcQuotationTotals(
    [{ itemName: input.itemName, quantity: 1, unit: "lot", unitPrice: input.amount, discountPercent: 0, taxPercent: 11 }],
    0
  );
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.create({
      data: {
        number: input.number,
        customerId: input.customerId,
        contactId: input.contactId,
        opportunityId: input.opportunityId,
        quotationDate: input.quotationDate,
        salesPicId: input.salesPicId,
        signerId: input.salesPicId,
        subjectLine: input.subjectLine,
        revision: input.revision ?? 0,
        commercialTerms: DEFAULT_COMMERCIAL_TERMS as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        grandTotal: totals.grandTotal,
        status: "DRAFT",
        createdById: actor.userId,
        items: {
          create: [{ itemName: input.itemName, quantity: 1, unit: "lot", unitPrice: input.amount, discountPercent: 0, taxPercent: 11, total: totals.lineTotals[0], sortOrder: 0 }],
        },
      },
    });
    return quotation;
  });
}

async function main() {
  console.log("Seeding SSO Company Management System with real PROSPEK 2026 pipeline data...\n");

  // ---- Company settings + folders -----------------------------------
  await prisma.companySettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      companyName: "PT. Sarana Sinergi Optima",
      address: "Plaza Aminta Lt. 5/504, TB Simatupang Kav. 10, Pondok Pinang, Kebayoran Lama",
      city: "Jakarta Selatan", province: "DKI Jakarta", country: "Indonesia",
      phone: "+62 21 7511922",
      email: "info@saranasinergioptima.co.id", currency: "IDR", timezone: "Asia/Jakarta",
      logoUrl: "branding/logo.png",
      stampImageUrl: "branding/stamp.png",
      customerPrefix: "CUS/MKT", leadPrefix: "LED/MKT", opportunityPrefix: "OPP/MKT",
      quotationPrefix: "QUO/MKT", poPrefix: "PO/MKT", contractPrefix: "CTR/MKT",
      projectPrefix: "PRJ/OPS", invoicePrefix: "INV/FIN", paymentPrefix: "PAY/FIN",
      expensePrefix: "EXP/FIN", costingPrefix: "CST/MKT", numberPadding: 3,
    },
    update: {
      logoUrl: "branding/logo.png", stampImageUrl: "branding/stamp.png",
      customerPrefix: "CUS/MKT", leadPrefix: "LED/MKT", opportunityPrefix: "OPP/MKT",
      quotationPrefix: "QUO/MKT", poPrefix: "PO/MKT", contractPrefix: "CTR/MKT",
      projectPrefix: "PRJ/OPS", invoicePrefix: "INV/FIN", paymentPrefix: "PAY/FIN",
      expensePrefix: "EXP/FIN", costingPrefix: "CST/MKT", numberPadding: 3,
    },
  });

  await resetTransactionalData(prisma);
  await prisma.$transaction((tx) => ensureCompanyFolders(tx));

  // ---- Users (change these passwords before real use) ----
  const demoPassword = await hashPassword("Password123!");
  const [admin, sales, finance, pm] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@sso.demo" },
      create: { name: "Sulton Mohamad", email: "admin@sso.demo", role: "ADMIN", passwordHash: demoPassword, title: "Director", signatureImageUrl: "branding/signature-sulton.jpeg" },
      update: { name: "Sulton Mohamad", title: "Director", signatureImageUrl: "branding/signature-sulton.jpeg" },
    }),
    prisma.user.upsert({
      where: { email: "sales@sso.demo" },
      create: { name: "Galang", email: "sales@sso.demo", role: "SALES", passwordHash: demoPassword, title: "Sales Manager", signatureImageUrl: "branding/signature-galang.png" },
      update: { name: "Galang", title: "Sales Manager", signatureImageUrl: "branding/signature-galang.png" },
    }),
    prisma.user.upsert({ where: { email: "finance@sso.demo" }, create: { name: "Budi Finance", email: "finance@sso.demo", role: "FINANCE", passwordHash: demoPassword }, update: {} }),
    prisma.user.upsert({ where: { email: "pm@sso.demo" }, create: { name: "Rian PM", email: "pm@sso.demo", role: "PROJECT_MANAGER", passwordHash: demoPassword }, update: {} }),
  ]);
  void finance;

  // Additional real SSO PICs (confirmed by the founder). Emails below are
  // placeholder @sso.demo addresses like the rest of the seeded accounts —
  // update to their real company email/password in Settings > Users.
  // "F Yudiyanto" is the same person previously (incorrectly) seeded as an
  // external Contact under PT Marina Bara Lestari — moved here as an SSO
  // employee instead (see the MBL section below).
  const [fyudiyanto, aldo, yohana] = await Promise.all([
    prisma.user.upsert({
      where: { email: "fyudiyanto@sso.demo" },
      create: { name: "F Yudiyanto", email: "fyudiyanto@sso.demo", role: "SALES", passwordHash: demoPassword },
      update: { name: "F Yudiyanto" },
    }),
    prisma.user.upsert({
      where: { email: "aldoakbar@sso.demo" },
      create: { name: "Aldo Akbar", email: "aldoakbar@sso.demo", role: "SALES", passwordHash: demoPassword },
      update: { name: "Aldo Akbar" },
    }),
    prisma.user.upsert({
      where: { email: "yohanamunthe@sso.demo" },
      create: { name: "Yohana S Munthe", email: "yohanamunthe@sso.demo", role: "SALES", passwordHash: demoPassword, title: "Sales Engineer" },
      update: { name: "Yohana S Munthe", title: "Sales Engineer" },
    }),
  ]);
  void fyudiyanto;
  void aldo;
  void yohana;
  console.log("Users ready: admin@sso.demo / sales@sso.demo / finance@sso.demo / pm@sso.demo (password: Password123!)");
  console.log("Also added: fyudiyanto@sso.demo / aldoakbar@sso.demo / yohanamunthe@sso.demo (same password) — update emails to their real ones in Settings > Users.");

  const salesActor = actorOf(sales);
  const adminActor = actorOf(admin);

  // ---- Real customers, contacts, opportunities (from PROSPEK 2026) ------

  async function makeCustomerWithContact(opts: {
    companyName: string; industry: string; city: string;
    contact: { name: string; position?: string; email?: string; isPrimary?: boolean };
    type: "CUSTOMER" | "PROSPECT";
  }) {
    const number = await prisma.$transaction((tx) => generateNumber(tx, "CUSTOMER"));
    const customer = await prisma.customer.create({
      data: {
        number, companyName: opts.companyName, customerType: opts.type,
        industry: opts.industry, city: opts.city, country: "Indonesia",
        status: "ACTIVE", createdById: admin.id,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        customerId: customer.id, name: opts.contact.name, position: opts.contact.position,
        email: opts.contact.email, isPrimary: opts.contact.isPrimary ?? true,
      },
    });
    return { customer, contact };
  }

  async function makeOpportunity(opts: {
    customerId: string; contactId?: string; name: string; estimatedValue: number;
    probability: number; status: "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
  }) {
    const number = await prisma.$transaction((tx) => generateNumber(tx, "OPPORTUNITY"));
    const opp = await prisma.opportunity.create({
      data: {
        number, customerId: opts.customerId, contactId: opts.contactId, name: opts.name,
        estimatedValue: opts.estimatedValue, probability: opts.probability,
        salesPicId: sales.id, source: "Direct", status: opts.status,
      },
      include: { customer: { select: { companyName: true } } },
    });
    await prisma.$transaction((tx) => createOpportunityFolders(tx, opp, opp.customer.companyName));
    return opp;
  }

  // 1) PT Jakarta Prima Cranes — Gearbox Drive Unit Maintenance & Servicing.
  //    WON (PO confirmed, "NO JO" 226 in the job-costing sheet, 20% physical progress).
  const jpc = await makeCustomerWithContact({
    companyName: "PT Jakarta Prima Cranes",
    industry: "Crane & Material Handling", city: "Jakarta",
    contact: { name: "Fahmi", position: "Marketing" },
    type: "CUSTOMER",
  });
  const jpcOpp = await makeOpportunity({
    customerId: jpc.customer.id, contactId: jpc.contact.id,
    name: "Gearbox Drive Unit Maintenance & Servicing - PT Jakarta Prima Cranes",
    estimatedValue: 320_000_000, probability: 100, status: "WON",
  });
  const jpcQuotation = await createRealQuotation({
    number: "002/QUO/MKT/V/2026", customerId: jpc.customer.id, contactId: jpc.contact.id,
    opportunityId: jpcOpp.id, salesPicId: sales.id, quotationDate: new Date("2026-07-17"),
    subjectLine: "Quotation — Gearbox Drive Unit Maintenance & Servicing",
    itemName: "Gearbox Drive Unit Maintenance & Servicing", amount: 320_000_000,
  }, salesActor);
  await submitQuotationForApproval(jpcQuotation.id, salesActor);
  await approveQuotation(jpcQuotation.id, adminActor);
  const { project: jpcProject } = await markQuotationWon(jpcQuotation.id, salesActor, { projectManagerId: pm.id });
  await prisma.project.update({ where: { id: jpcProject.id }, data: { jobNumber: "226", progressPercent: 20, budget: 132_750_000 } });

  // 2) PT Nusa Cipta Sarana — Bracket Idler fabrication.
  //    WON but not yet started ("NO JO" 326, "BELUM MULAI", 0% progress).
  const ncs = await makeCustomerWithContact({
    companyName: "PT Nusa Cipta Sarana",
    industry: "Material Handling / EPC", city: "Jakarta",
    contact: { name: "Ali Efendi", position: "Director" },
    type: "CUSTOMER",
  });
  const ncsOpp = await makeOpportunity({
    customerId: ncs.customer.id, contactId: ncs.contact.id,
    name: "Bracket Idler for Mechanical Parts - PT Nusa Cipta Sarana",
    estimatedValue: 366_000_000, probability: 100, status: "WON",
  });
  const ncsQuotation = await createRealQuotation({
    number: "003/QUO/MKT/VI/2026", customerId: ncs.customer.id, contactId: ncs.contact.id,
    opportunityId: ncsOpp.id, salesPicId: sales.id, quotationDate: new Date("2026-07-29"),
    subjectLine: "Quotation — Bracket Idler for Mechanical Parts",
    itemName: "Bracket Idler for Mechanical Parts - Fabrication & Supply", amount: 366_000_000,
    revision: 2, // real PDF filename is "...VI_2026 ... PT NCS R2.pdf"
  }, salesActor);
  await submitQuotationForApproval(ncsQuotation.id, salesActor);
  await approveQuotation(ncsQuotation.id, adminActor);
  const { project: ncsProject } = await markQuotationWon(ncsQuotation.id, salesActor, { projectManagerId: pm.id });
  await prisma.project.update({ where: { id: ncsProject.id }, data: { jobNumber: "326", progressPercent: 0, status: "PLANNING", budget: 170_000_000 } });

  // 3) PT Jakarta Prima Cranes (Balikpapan) — motor 45kW + 55kW repair/service.
  //    WON, PO confirmed ("NO JO" BPN-0505 / BPN-0506, 40% progress). Tracked
  //    as one combined engagement/Project since the real folder and job sheet
  //    group both motors under the same Balikpapan site job.
  const jpcBpn = await makeCustomerWithContact({
    companyName: "PT Jakarta Prima Cranes (Balikpapan)",
    industry: "Crane & Material Handling", city: "Balikpapan",
    contact: { name: "Suci Rahmawati", position: "Marketing" },
    type: "CUSTOMER",
  });
  const jpcBpnOpp = await makeOpportunity({
    customerId: jpcBpn.customer.id, contactId: jpcBpn.contact.id,
    name: "Repair Motor & Gearbox (45kW + 55kW) - PT Jakarta Prima Cranes Balikpapan",
    estimatedValue: 44_000_000, probability: 100, status: "WON",
  });
  const jpcBpnQuotation = await createRealQuotation({
    number: "005/QUO/MKT/V/2026", customerId: jpcBpn.customer.id, contactId: jpcBpn.contact.id,
    opportunityId: jpcBpnOpp.id, salesPicId: sales.id, quotationDate: new Date("2026-07-17"),
    subjectLine: "Quotation — Repair Motor & Gearbox",
    itemName: "Service Motor 45kW/60HP + 55kW/75HP", amount: 44_000_000,
    revision: 2, // real PDF is issued as "005/QUO/MKT/V/2026.R2"
  }, salesActor);
  await submitQuotationForApproval(jpcBpnQuotation.id, salesActor);
  await approveQuotation(jpcBpnQuotation.id, adminActor);
  const { project: jpcBpnProject } = await markQuotationWon(jpcBpnQuotation.id, salesActor, { projectManagerId: pm.id });
  await prisma.project.update({ where: { id: jpcBpnProject.id }, data: { jobNumber: "BPN-0505 / BPN-0506", progressPercent: 40, budget: 37_837_838 } });

  // 4) PT Marina Bara Lestari — Matting Board supply, Berau site.
  //    Still PROSPEK — no PO yet, kept as an Opportunity only (no Quotation
  //    record yet: no SSO-numbered quotation was found for this one, only a
  //    proposal routed via PT Nusa Cipta Sarana). Value from their own
  //    proposal document ("Total Excluding PPN": Rp 8,895,000,000).
  // Note: the original proposal doc listed "Attn: Bp. Falldy Yudianto" here,
  // but the founder confirmed that's actually SSO's own "F Yudiyanto" (see
  // the SSO Users section above), not an external PT Marina Bara Lestari
  // contact — so only Ahmad Riyanto is kept as MBL's real external contact.
  const mbl = await makeCustomerWithContact({
    companyName: "PT Marina Bara Lestari",
    industry: "Coal Mining", city: "Berau, Kalimantan Timur",
    contact: { name: "Ahmad Riyanto", email: "ahmad.riyanto@marinabara.com", isPrimary: true },
    type: "PROSPECT",
  });
  await makeOpportunity({
    customerId: mbl.customer.id, contactId: mbl.contact.id,
    name: "Matting Board Supply - Site Berau (PT Marina Bara Lestari)",
    estimatedValue: 8_895_000_000, probability: 30, status: "PROPOSAL",
  });

  // ---- Advance number sequences past what's already been issued in the
  // real world (SOP: a burned number must never be reused). Quotation
  // numbers up to 006/QUO/MKT/.../2026 exist in real files even though only
  // 002/003/005 above are represented as structured records here.
  await prisma.numberSequence.upsert({
    where: { entityType_year: { entityType: "QUOTATION", year: 2026 } },
    create: { entityType: "QUOTATION", year: 2026, prefix: "QUO/MKT", currentNumber: 6, padding: 3 },
    update: { currentNumber: 6 },
  });

  console.log("Seeded 4 real customers/opportunities (3 Won -> Projects with folders migrated; 1 still Proposal).");
  console.log("Job Numbers set: 226 (JPC Jakarta), 326 (PT NCS), BPN-0505 / BPN-0506 (JPC Balikpapan).");
  console.log("\nSeed complete. Log in with any of the demo accounts above.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
