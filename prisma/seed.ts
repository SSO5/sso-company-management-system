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
import {
  createQuotation,
  submitQuotationForApproval, approveQuotation, markQuotationWon, markQuotationSent,
} from "../src/lib/workflows/quotation";
import { createCostingSheet, markCostingFinal } from "../src/lib/workflows/costing";
import {
  submitVendorPOForApproval, approveVendorPO, markVendorPOSent,
} from "../src/lib/workflows/vendor-po";
import { calcQuotationTotals, calcVendorPoTotals, calcInvoiceTotals } from "../src/lib/workflows/calculations";
import { submitInvoiceForApproval, approveInvoice, markInvoiceIssued } from "../src/lib/workflows/finance";
import { createProgressReport, addProgressReportItem } from "../src/lib/workflows/progress-report";
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

/** Same "already issued in the real world" pattern as createRealQuotation
 * above — SSO's own vendor POs to PT Athena Teknik Perkasa already carry
 * real numbers in exactly the app's own format (NNN/PO/PRO/<roman>/2026),
 * so we preserve them verbatim instead of burning a fresh generateNumber()
 * call. The NumberSequence counter for VENDOR_PO is advanced separately in
 * main() so future auto-generated numbers never collide. */
async function createRealVendorPO(input: {
  number: string; vendorName: string; vendorAttn?: string; vendorEmail?: string;
  deliveryName?: string; deliveryAddress?: string; deliveryAttn?: string;
  customerId?: string; projectId?: string; poDate: Date;
  quotationRef?: string; projectRef?: string; paymentTerms?: string; deliveryTerms?: string;
  items: { description: string; quantity: number; unit: string; unitPrice: number; groupLabel?: string }[];
  signerId: string; createdById: string;
}) {
  const totals = calcVendorPoTotals(input.items, 0, 11);
  return prisma.vendorPurchaseOrder.create({
    data: {
      number: input.number, vendorName: input.vendorName, vendorAttn: input.vendorAttn, vendorEmail: input.vendorEmail,
      deliveryName: input.deliveryName, deliveryAddress: input.deliveryAddress, deliveryAttn: input.deliveryAttn,
      customerId: input.customerId, projectId: input.projectId, poDate: input.poDate,
      quotationRef: input.quotationRef, projectRef: input.projectRef,
      paymentTerms: input.paymentTerms, deliveryTerms: input.deliveryTerms,
      subtotal: totals.subtotal, discount: totals.discount, taxPercent: 11, tax: totals.tax, grandTotal: totals.grandTotal,
      status: "DRAFT", signerId: input.signerId, createdById: input.createdById,
      items: { create: input.items.map((it, idx) => ({ ...it, amount: totals.lineTotals[idx], sortOrder: idx })) },
    },
  });
}

/** Same pattern for Invoice — both real invoices found ("001/INV/FIN/V/2026"
 * and "001/INV/FIN/VIII/2026") already carry the app's own number format.
 * NOTE for the founder: both are printed as "001" despite being issued in
 * different months (23 Jul and 5 Aug) — the app's own generateNumber()
 * would NEVER produce that (it's one running counter per YEAR, not reset
 * per month), so this is a real inconsistency in the old manual process,
 * not something to replicate going forward. Preserved here only because
 * it's what the real, already-sent PDF says. */
async function createRealInvoice(input: {
  number: string; customerId: string; projectId?: string; contactId?: string;
  invoiceDate: Date; dueDate: Date; customerPO?: string; poDate?: Date; jobNo?: string;
  salesPicId?: string; dpPercent?: number; discount?: number;
  items: { groupLabel?: string; description: string; quantity: number; unit: string; unitPrice: number; taxPercent?: number; isNote?: boolean }[];
  createdById: string;
}) {
  const items = input.items.map((it) => ({ ...it, taxPercent: it.taxPercent ?? 0, isNote: it.isNote ?? false }));
  const totals = calcInvoiceTotals(items, input.discount ?? 0);
  return prisma.invoice.create({
    data: {
      number: input.number, customerId: input.customerId, projectId: input.projectId, contactId: input.contactId,
      invoiceDate: input.invoiceDate, dueDate: input.dueDate, customerPO: input.customerPO, poDate: input.poDate,
      jobNo: input.jobNo, salesPicId: input.salesPicId, dpPercent: input.dpPercent ?? null,
      subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, grandTotal: totals.grandTotal,
      status: "DRAFT", createdById: input.createdById,
      items: { create: items.map((it, idx) => ({ ...it, total: totals.lineTotals[idx], sortOrder: idx })) },
    },
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

  // ---- Users — real org structure confirmed by the founder (11 Aug 2026):
  // Faldy=Dirut, Sulton=CFO+COO, Aldo=GM (all three ADMIN — Aldo is ADMIN
  // only "sementara" until the multi-role feature is built), Galang=VIEWER
  // (non-executive Director, view-only), Yohana + Telly = Sales Engineer.
  // "Budi Finance"/"Rian PM" were unused placeholder seats — removed per
  // founder instruction, replaced by Telly Fahrul.
  // IMPORTANT: this password is a shared placeholder for first login only —
  // every real person should change theirs immediately after logging in.
  const demoPassword = await hashPassword("Password123!");
  const [admin, fyudiyanto, aldo, galang, yohana, telly] = await Promise.all([
    prisma.user.upsert({
      where: { email: "Sultonmuch96@gmail.com" },
      create: { name: "Sulton Mohamad", email: "Sultonmuch96@gmail.com", role: "ADMIN", passwordHash: demoPassword, title: "Director", signatureImageUrl: "branding/signature-sulton.jpeg" },
      update: { name: "Sulton Mohamad", role: "ADMIN", title: "Director", signatureImageUrl: "branding/signature-sulton.jpeg" },
    }),
    prisma.user.upsert({
      where: { email: "falldyyudianto97@gmail.com" },
      create: { name: "F Yudiyanto", email: "falldyyudianto97@gmail.com", whatsappNumber: "628128046310", role: "ADMIN", passwordHash: demoPassword, title: "President Director" },
      update: { name: "F Yudiyanto", whatsappNumber: "628128046310", role: "ADMIN", title: "President Director" },
    }),
    prisma.user.upsert({
      where: { email: "aldoakbar44@gmail.com" },
      create: { name: "Aldo Akbar", email: "aldoakbar44@gmail.com", whatsappNumber: "6281385456695", role: "ADMIN", passwordHash: demoPassword, title: "General Manager" },
      update: { name: "Aldo Akbar", whatsappNumber: "6281385456695", role: "ADMIN", title: "General Manager" },
    }),
    // Galang keeps his original seed email (no new one was given) — only
    // role/title/WA are corrected here. Update the email in Settings > Users
    // once his real one is known.
    prisma.user.upsert({
      where: { email: "sales@sso.demo" },
      create: { name: "Galang", email: "sales@sso.demo", whatsappNumber: "6285281673393", role: "VIEWER", passwordHash: demoPassword, title: "Director", signatureImageUrl: "branding/signature-galang.png" },
      update: { name: "Galang", whatsappNumber: "6285281673393", role: "VIEWER", title: "Director", signatureImageUrl: "branding/signature-galang.png" },
    }),
    // Yohana logs in with saranasinergi.optima@gmail.com, NOT her personal
    // address — that is the account key here on purpose. Keying this upsert on
    // yohanamunthe555@gmail.com (as an earlier version did) took the `create`
    // branch and produced a SECOND account, splitting her transaction history
    // away from the login she actually uses. The upsert key must always be the
    // address the person signs in with, not the nicest-looking one.
    prisma.user.upsert({
      where: { email: "saranasinergi.optima@gmail.com" },
      create: { name: "Yohana S Munthe", email: "saranasinergi.optima@gmail.com", whatsappNumber: "628128276234", role: "SALES", passwordHash: demoPassword, title: "Sales Engineer" },
      update: { name: "Yohana S Munthe", whatsappNumber: "628128276234", role: "SALES", title: "Sales Engineer" },
    }),
    prisma.user.upsert({
      where: { email: "tellyfahrul@gmail.com" },
      create: { name: "Telly Fahrul", email: "tellyfahrul@gmail.com", whatsappNumber: "6285735147654", role: "SALES", passwordHash: demoPassword, title: "Sales Engineer" },
      update: { name: "Telly Fahrul", whatsappNumber: "6285735147654", role: "SALES", title: "Sales Engineer" },
    }),
  ]);
  // Remove the old unused placeholder seats now that real people cover
  // Finance/PM coverage via the ADMIN role — only if nothing links to them.
  for (const email of ["finance@sso.demo", "pm@sso.demo"]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      try {
        await prisma.user.delete({ where: { id: u.id } });
        console.log(`Removed unused placeholder user ${email}.`);
      } catch {
        console.log(`Could not remove ${email} (has linked records) — deactivate it manually in Settings > Users instead.`);
        await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      }
    }
  }
  void galang;
  void telly;
  console.log("Users ready — real people: Sulton (ADMIN/CFO+COO), F Yudiyanto (ADMIN/President Director), Aldo Akbar (ADMIN/GM), Galang (VIEWER/Director), Yohana + Telly Fahrul (SALES/Sales Engineer).");
  console.log("Shared first-login password for all: Password123! — everyone should change theirs after logging in.");

  // Sales PIC per deal, matching who actually owned each real deal (not one
  // generic "sales" user) — Yohana ran both JPC deals, Sulton signed NCS and
  // MBL directly as Direktur. Faldy/Aldo approve where Sulton is the submitter
  // (maker-checker forbids self-approval), Sulton approves where Yohana submits.
  const yohanaActor = actorOf(yohana);
  const sultonActor = actorOf(admin);
  const faldyActor = actorOf(fyudiyanto);
  const aldoActor = actorOf(aldo);
  const salesActor = yohanaActor; // kept for the JPC-Jakarta/JPC-BPN calls below
  const adminActor = sultonActor; // kept for the JPC-Jakarta/JPC-BPN calls below

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
    salesPicId: string;
  }) {
    const number = await prisma.$transaction((tx) => generateNumber(tx, "OPPORTUNITY"));
    const opp = await prisma.opportunity.create({
      data: {
        number, customerId: opts.customerId, contactId: opts.contactId, name: opts.name,
        estimatedValue: opts.estimatedValue, probability: opts.probability,
        salesPicId: opts.salesPicId, source: "Direct", status: opts.status,
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
    estimatedValue: 320_000_000, probability: 100, status: "WON", salesPicId: yohana.id,
  });
  const jpcQuotation = await createRealQuotation({
    number: "002/QUO/MKT/V/2026", customerId: jpc.customer.id, contactId: jpc.contact.id,
    opportunityId: jpcOpp.id, salesPicId: yohana.id, quotationDate: new Date("2026-07-23"),
    subjectLine: "Quotation — Gearbox Drive Unit Maintenance & Servicing",
    itemName: "Gearbox Drive Unit Maintenance & Servicing", amount: 320_000_000,
    revision: 4, // real final PDF is "002/QUO/MKT/V/2026.R4", 23 Jul 2026 (final nego date)
  }, yohanaActor);
  await submitQuotationForApproval(jpcQuotation.id, yohanaActor);
  await approveQuotation(jpcQuotation.id, sultonActor);
  await markQuotationSent(jpcQuotation.id, yohanaActor);
  const { project: jpcProject } = await markQuotationWon(jpcQuotation.id, yohanaActor, { projectManagerId: aldo.id });
  await prisma.project.update({ where: { id: jpcProject.id }, data: { jobNumber: "226", progressPercent: 20, budget: 132_750_000 } });

  // 2) PT Nusa Cipta Sarana — Bracket Idler fabrication.
  //    WON but not yet started ("NO JO" 326, "BELUM MULAI", 0% progress).
  //    Sulton signed this one directly as Direktur — Faldy approves instead
  //    of Sulton to satisfy maker-checker (submitter can't self-approve).
  const ncs = await makeCustomerWithContact({
    companyName: "PT Nusa Cipta Sarana",
    industry: "Material Handling / EPC", city: "Jakarta",
    contact: { name: "Ali Efendi", position: "Director" },
    type: "CUSTOMER",
  });
  const ncsOpp = await makeOpportunity({
    customerId: ncs.customer.id, contactId: ncs.contact.id,
    name: "Bracket Idler for Mechanical Parts - PT Nusa Cipta Sarana",
    estimatedValue: 366_000_000, probability: 100, status: "WON", salesPicId: admin.id,
  });
  const ncsQuotation = await createRealQuotation({
    number: "003/QUO/MKT/VI/2026", customerId: ncs.customer.id, contactId: ncs.contact.id,
    opportunityId: ncsOpp.id, salesPicId: admin.id, quotationDate: new Date("2026-07-29"),
    subjectLine: "Quotation — Bracket Idler for Mechanical Parts",
    itemName: "Bracket Idler for Mechanical Parts - Fabrication & Supply", amount: 366_000_000,
    revision: 2, // real PDF filename is "...VI_2026 ... PT NCS R2.pdf"
  }, sultonActor);
  await submitQuotationForApproval(ncsQuotation.id, sultonActor);
  await approveQuotation(ncsQuotation.id, faldyActor);
  await markQuotationSent(ncsQuotation.id, sultonActor);
  const { project: ncsProject } = await markQuotationWon(ncsQuotation.id, sultonActor, { projectManagerId: aldo.id });
  await prisma.project.update({ where: { id: ncsProject.id }, data: { jobNumber: "326", progressPercent: 0, status: "PLANNING", budget: 170_000_000 } });
  console.log("NOTE: NCS Costing Sheet NOT auto-created — no verified real COGS breakdown for Bracket Idler was found (only an unformalized draft totalling Rp421,873,000, which the founder said is NOT the figure to use). Build the Costing manually once the real vendor cost (CV. Erlangga Jaya Tehnik quote 018/EJT-VI/2026 R03) is confirmed, targeting the active quotation value of Rp366,000,000.");

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
    estimatedValue: 44_000_000, probability: 100, status: "WON", salesPicId: yohana.id,
  });
  const jpcBpnQuotation = await createRealQuotation({
    number: "005/QUO/MKT/V/2026", customerId: jpcBpn.customer.id, contactId: jpcBpn.contact.id,
    opportunityId: jpcBpnOpp.id, salesPicId: yohana.id, quotationDate: new Date("2026-07-17"),
    subjectLine: "Quotation — Repair Motor & Gearbox",
    itemName: "Service Motor 45kW/60HP + 55kW/75HP", amount: 44_000_000,
    revision: 2, // real PDF is issued as "005/QUO/MKT/V/2026.R2"
  }, yohanaActor);
  await submitQuotationForApproval(jpcBpnQuotation.id, yohanaActor);
  await approveQuotation(jpcBpnQuotation.id, sultonActor);
  await markQuotationSent(jpcBpnQuotation.id, yohanaActor);
  const { project: jpcBpnProject } = await markQuotationWon(jpcBpnQuotation.id, yohanaActor, { projectManagerId: aldo.id });
  await prisma.project.update({ where: { id: jpcBpnProject.id }, data: { jobNumber: "BPN-0505 / BPN-0506", progressPercent: 40, budget: 37_837_838 } });

  // ---- JPC Jakarta: Costing, Vendor PO (Athena), DP Invoice, Progress
  // Report — all found via WA archive review (11 Aug 2026 update). ----
  const jpcCosting = await createCostingSheet({
    customerId: jpc.customer.id, opportunityId: jpcOpp.id,
    projectTitle: "Overhaul Gearbox Dodge Magnagear 100K - Drive Unit 6804/6805/6806",
    jobNo: "226", costingDate: new Date("2026-05-04"),
    operationalCost: 25_000_000, ppnPercent: 11, pphFinalPercent: 2.65,
    notes: "PPh Final Jasa Konstruksi 2.65% dipakai di Excel asli (bukan default aplikasi 2%) — lihat Panduan Input Data Aktual.",
    sections: [{
      code: "MAT", name: "Vendor / Material (PT Athena Teknik Perkasa)",
      items: [{ name: "Overhaul + repair 3x Gearbox Dodge + Motor Brake Assembly (vendor Athena)", quantity: 1, unit: "lot", currency: "IDR", costUnitPrice: 107_750_000, supplierDiscountPercent: 0, marginPercent: 34 }],
    }],
  }, yohanaActor);
  await markCostingFinal(jpcCosting.id, yohanaActor);

  const jpcVendorPo = await createRealVendorPO({
    number: "002/PO/PRO/VII/2026", vendorName: "PT Athena Teknik Perkasa", vendorAttn: "Bp. Kodrat AS (081310808961)",
    vendorEmail: "athenateknikperkasa@gmail.com",
    deliveryName: "PT Jakarta Prima Cranes", deliveryAddress: "Workshop JPC Jl. Raya Gunung Putri No. 61, Kabupaten Bogor, Jawa Barat", deliveryAttn: "Suci Rahmawati",
    customerId: jpc.customer.id, projectId: jpcProject.id, poDate: new Date("2026-07-28"),
    quotationRef: "ATP26-VII/Ext/14", projectRef: "EPC-L/2026-0450",
    paymentTerms: "30% DP Setelah PO, 70% Setelah pekerjaan selesai.", deliveryTerms: "4 minggu setelah PO diterima",
    items: [
      { groupLabel: "1. OVERHOUL GEARBOX DODGE MAGNAGEAR 100K", description: "Gearbox Drive Unit 6804 (bearing, mechanical seal, pelumas, baut, painting, assembling)", quantity: 1, unit: "lot", unitPrice: 29_750_000 },
      { description: "Gearbox Drive Unit 6805 (bearing, mechanical seal, pelumas, baut, painting, assembling)", quantity: 1, unit: "lot", unitPrice: 29_750_000 },
      { description: "Gearbox Drive Unit 6806 (bearing, mechanical seal, pelumas, baut, painting, assembling)", quantity: 1, unit: "lot", unitPrice: 29_750_000 },
      { groupLabel: "2. REPAIR RANGKAIAN MOTOR BREAK", description: "Penggantian bearing (2 pc) + mechanical seal (2 pc) + painting", quantity: 1, unit: "lot", unitPrice: 3_000_000 },
      { groupLabel: "3. TRANSPORTATION & OPERATION", description: "Transportation (akomodasi pengambilan & pengembalian gearbox di WS JPC)", quantity: 1, unit: "lot", unitPrice: 3_000_000 },
      { description: "Operation cost", quantity: 1, unit: "lot", unitPrice: 8_000_000 },
      { groupLabel: "4. INSTALLATION", description: "Maggering test, RPM/voltage/current measurement, alignment motor, install baseplate, test performance", quantity: 1, unit: "lot", unitPrice: 4_500_000 },
    ],
    signerId: sultonActor.userId, createdById: aldo.id,
  });
  await submitVendorPOForApproval(jpcVendorPo.id, aldoActor);
  await approveVendorPO(jpcVendorPo.id, sultonActor);
  await markVendorPOSent(jpcVendorPo.id, aldoActor);

  const jpcInvoice = await createRealInvoice({
    number: "001/INV/FIN/VIII/2026", customerId: jpc.customer.id, projectId: jpcProject.id, contactId: jpc.contact.id,
    invoiceDate: new Date("2026-08-05"), dueDate: new Date("2026-08-19"),
    customerPO: "EPC-L/2026-0450", poDate: new Date("2026-07-28"), jobNo: "JO-2607-003",
    salesPicId: yohana.id, dpPercent: 20, discount: 5_917_000,
    items: [
      { groupLabel: "1. OVERHOUL GEARBOX DODGE MAGNAGEAR 100K", description: "Gearbox Drive Unit 6804 (bearing, mechanical seal, pelumas, baut, painting, assembly)", quantity: 1, unit: "lot", unitPrice: 100_000_000 },
      { description: "Gearbox Drive Unit 6805 (bearing, mechanical seal, pelumas, baut, painting, assembly)", quantity: 1, unit: "lot", unitPrice: 100_000_000 },
      { description: "Gearbox Drive Unit 6806 (bearing, mechanical seal, pelumas, baut, painting, assembly)", quantity: 1, unit: "lot", unitPrice: 100_000_000 },
      { groupLabel: "MOTOR BRAKE ASSEMBLY REPAIR", description: "Bearing replacement (2 pcs)", quantity: 1, unit: "lot", unitPrice: 4_000_000 },
      { description: "Mechanical seal replacement (2 pcs)", quantity: 1, unit: "lot", unitPrice: 2_000_000 },
      { description: "Painting", quantity: 1, unit: "lot", unitPrice: 667_000 },
      { description: "Transportation — all logistics/accommodation for pickup & return of Gearbox at JPC Workshop", quantity: 1, unit: "lot", unitPrice: 3_500_000 },
      { description: "Operation cost", quantity: 1, unit: "lot", unitPrice: 15_750_000 },
    ],
    createdById: yohana.id,
  });
  await submitInvoiceForApproval(jpcInvoice.id, yohanaActor);
  await approveInvoice(jpcInvoice.id, sultonActor);
  await markInvoiceIssued(jpcInvoice.id, sultonActor);
  console.log("JPC Jakarta DP Invoice 001/INV/FIN/VIII/2026 due 19 Aug 2026 (Rp71,040,000 DP 20%) — no payment confirmation was found in WA, verify with the bank before this date.");

  // Progress Report — real field data as of 10 Agustus 2026 (3 gearbox units,
  // sent via WA by vendor Kodrat, revision "progdodge-4.pdf" 11 Aug 08:10).
  // The app auto-numbers this fresh (won't literally read "ENG-REP-004" like
  // the vendor's own informal PDF did — that was a parallel, pre-app numbering
  // scheme, not something this system needs to replicate).
  const jpcProgressReport = await createProgressReport(
    { projectId: jpcProject.id, inspectionDate: new Date("2026-08-10"), location: "Workshop JPC Jl. Raya Gunung Putri No. 61, Kab. Bogor", preparedById: aldo.id },
    aldo.id
  );
  const jpcCheckpoints: { partName: string; notes: string; isDone: boolean }[] = [
    { partName: "CV 6806 — Bearing Taper Roller Timken HM 807010 (x2)", notes: "Kondisi rusak, bearing dikirim supplier Selasa 11/8/26", isDone: false },
    { partName: "CV 6806 — Bearing Taper Roller Timken 655/652A", notes: "Kondisi rusak, bearing dikirim supplier Selasa 11/8/26", isDone: false },
    { partName: "CV 6806 — Bearing Taper Roller Timken 68712", notes: "Kondisi rusak, bearing dikirim supplier Selasa 11/8/26", isDone: false },
    { partName: "CV 6806 — Cassette seal/unitized seal (4 pc)", notes: "Tidak ada item code, masih kesulitan pengadaan — bisa diganti merek lain", isDone: false },
    { partName: "CV 6806 — Sprue gear & pinion/bevel gear set (6 komponen)", notes: "Kondisi bagus, reuse", isDone: true },
    { partName: "CV 6805 — Bearing Timken 32024-X, SKF 6318, SKF 2215 EC", notes: "Kondisi rusak, bearing dikirim supplier Selasa 11/8/26", isDone: false },
    { partName: "CV 6805 — Oil seal CZ CFD A1 (4pc) + CZ CFD 90-110-13/12", notes: "Proses pengadaan", isDone: false },
    { partName: "CV 6805 — Sprue gear & bevel gear set (5 komponen)", notes: "Kondisi bagus, reuse", isDone: true },
    { partName: "CV 6804 — Bearing Timken 32024-X + PEER 6318 RLD", notes: "Kondisi rusak", isDone: false },
    { partName: "CV 6804 — Oil seal SKF 75x100x12 + SKF 90x110x12", notes: "Proses pengadaan", isDone: false },
    { partName: "CV 6804 — Sprue gear & bevel gear set (5 komponen)", notes: "Kondisi bagus, reuse", isDone: true },
  ];
  await Promise.all(jpcCheckpoints.map((cp, idx) =>
    addProgressReportItem({ progressReportId: jpcProgressReport.id, partName: cp.partName, notes: cp.notes, isDone: cp.isDone, sortOrder: idx }, {}, aldo.id)
  ));

  // ---- JPC Balikpapan: Vendor PO (Athena), Invoice, Additional Work
  // (still under JPC management review — NOT WON yet, kept separate). ----
  const jpcBpnVendorPo = await createRealVendorPO({
    number: "001/PO/PRO/VII/2026", vendorName: "PT Athena Teknik Perkasa", vendorAttn: "Bp. Kodrat AS (081310808961)",
    vendorEmail: "athenateknikperkasa@gmail.com",
    customerId: jpcBpn.customer.id, projectId: jpcBpnProject.id, poDate: new Date("2026-07-23"),
    projectRef: "2026/BPN-L-0505", paymentTerms: "30% DP setelah PO, 70% setelah pekerjaan selesai",
    items: [
      { description: "Service Motor 55kW/75HP (rewinding, bearing, mechanical seal, cover welding & lathe work, rotor balancing)", quantity: 1, unit: "lot", unitPrice: 32_500_000 },
      { description: "Overhaul Gearbox 45kW/60HP (ganti oli, ganti seal)", quantity: 1, unit: "lot", unitPrice: 11_500_000 },
    ],
    signerId: sultonActor.userId, createdById: yohana.id,
  });
  await submitVendorPOForApproval(jpcBpnVendorPo.id, yohanaActor);
  await approveVendorPO(jpcBpnVendorPo.id, sultonActor);
  await markVendorPOSent(jpcBpnVendorPo.id, yohanaActor);

  const jpcBpnInvoice = await createRealInvoice({
    number: "001/INV/FIN/V/2026", customerId: jpcBpn.customer.id, projectId: jpcBpnProject.id, contactId: jpcBpn.contact.id,
    invoiceDate: new Date("2026-07-23"), dueDate: new Date("2026-08-17"), customerPO: "2026/BPN-L-0505",
    salesPicId: yohana.id,
    items: [
      { groupLabel: "Motor 55 kW 75 HP", description: "Motor Rewinding", quantity: 1, unit: "unit", unitPrice: 18_000_000 },
      { description: "Replacement of Bearing 6313 SKF ZZ C3 (2 pcs)", quantity: 1, unit: "lot", unitPrice: 5_000_000 },
      { description: "Replacement of Mechanical Seal", quantity: 1, unit: "lot", unitPrice: 2_000_000 },
      { description: "Cover Welding & Lathe Work", quantity: 1, unit: "lot", unitPrice: 2_500_000 },
      { description: "Rotor Balancing", quantity: 1, unit: "lot", unitPrice: 5_000_000 },
      { groupLabel: "Motor 45 kW 60 HP", description: "Gearbox Overhaul", quantity: 1, unit: "lot", unitPrice: 9_500_000 },
      { description: "Replacement of Mechanical Seal", quantity: 1, unit: "lot", unitPrice: 2_000_000 },
    ],
    createdById: yohana.id,
  });
  await submitInvoiceForApproval(jpcBpnInvoice.id, yohanaActor);
  await approveInvoice(jpcBpnInvoice.id, sultonActor);
  await markInvoiceIssued(jpcBpnInvoice.id, sultonActor);
  console.log("JPC Balikpapan Invoice 001/INV/FIN/V/2026 due 17 Aug 2026 (Rp49,030,000) — no payment confirmation was found in WA, verify with the bank.");

  // Additional Work (Motor 45kW + Gearbox 45kW, then R2 adding Motor 55kW
  // flange issue) — sent to customer but still awaiting JPC management
  // approval as of 10 Aug 2026. Kept as SENT, not WON — do not mark won
  // until a real customer PO for this scope arrives.
  const jpcBpnAddlOpp = await makeOpportunity({
    customerId: jpcBpn.customer.id, contactId: jpcBpn.contact.id,
    name: "Additional Work — Motor 45kW + Gearbox 45kW (+ Motor 55kW flange) - JPC Balikpapan",
    estimatedValue: 0, probability: 50, status: "NEGOTIATION", salesPicId: yohana.id,
  });
  const jpcBpnAddlQuotation = await createRealQuotation({
    number: "006/QUO/MKT/VII/2026", customerId: jpcBpn.customer.id, contactId: jpcBpn.contact.id,
    opportunityId: jpcBpnAddlOpp.id, salesPicId: yohana.id, quotationDate: new Date("2026-08-06"),
    subjectLine: "Quotation — Additional Work Motor & Gearbox (Balikpapan)",
    itemName: "Additional repair: Motor 45kW + Gearbox 45kW + Motor 55kW (flange issue)", amount: 0,
    revision: 2, // R2 sent 6 Aug 2026, still pending JPC management sign-off as of 10 Aug
  }, yohanaActor);
  await submitQuotationForApproval(jpcBpnAddlQuotation.id, yohanaActor);
  await approveQuotation(jpcBpnAddlQuotation.id, sultonActor);
  await markQuotationSent(jpcBpnAddlQuotation.id, yohanaActor);
  console.log("JPC Balikpapan Additional Work quotation 006/QUO/MKT/VII/2026.R2 kept as SENT (not Won) — still being reviewed by JPC management as of 10 Aug 2026. Gearbox 55kW is a THIRD, fully separate track — on hold, no quotation exists yet, not seeded.");
  console.log("OPERATIONAL NOTE: JPC Balikpapan (Pak Sendy) complained that SSO engineering asked for technical data piecemeal instead of in one batch — worth turning into a standard SOP before the next inspection.");

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
  const mblOpp = await makeOpportunity({
    customerId: mbl.customer.id, contactId: mbl.contact.id,
    name: "Matting Board Supply - Site Berau (PT Marina Bara Lestari)",
    estimatedValue: 8_895_000_000, probability: 30, status: "PROPOSAL", salesPicId: admin.id,
  });

  // MBL Costing — import scheme direct from Dezhou (China), margin 20% per
  // the founder's explicit instruction. Figures verified against the app's
  // own margin formula (sellingUnitPrice = cost/(1-margin%), rounded up to
  // the nearest Rp1,000): 40,640,803 / (1-0.20) = 50,801,004.75 -> Rp50,802,000.
  // FX rate is an approximation (no period-accurate historical BI rate could
  // be retrieved) — flagged in the sheet's own notes field for correction.
  const mblCosting = await createCostingSheet({
    customerId: mbl.customer.id, opportunityId: mblOpp.id,
    projectTitle: "Supply HDPE Matting Board - PT Marina Bara Lestari (Site Berau)",
    costingDate: new Date(), // no original costing doc exists yet — this is SSO's first-ever costing for this deal, dated today per founder instruction ("dibuat aktual saja")
    operationalCost: 0, ppnPercent: 11, pphFinalPercent: 2,
    notes: "Skema impor langsung Dezhou (China), margin 20% pic Sulton. Kurs asumsi sama seperti quote lama (1,884 USD/mat) — BELUM ada quote baru dari pabrik, verifikasi ulang sebelum kirim resmi ke customer. Operasional (mobilisasi/supervisi ke site Berau) belum dihitung, isi kalau ada.",
    sections: [{
      code: "MAT", name: "Material (landed cost Dezhou China, all-in)",
      items: [{
        name: "HDPE Mat 6'x14'x4\", New — landed cost (material+freight+bea masuk+LC+cost of money)",
        quantity: 150, unit: "pcs", currency: "IDR",
        costUnitPrice: 40_640_803, supplierDiscountPercent: 0, marginPercent: 20,
      }],
    }],
  }, sultonActor);

  const mblQuotation = await createQuotation({
    customerId: mbl.customer.id, contactId: mbl.contact.id, opportunityId: mblOpp.id,
    salesPicId: admin.id, signerId: admin.id, quotationDate: new Date(),
    subjectLine: "Quotation — Supply HDPE Matting Board (Site Berau)",
    description: "First-ever SSO-numbered quotation for this deal — MBL previously only saw pricing via PT Nusa Cipta Sarana's own proposal.",
    commercialTerms: [],
    discount: 0,
    items: [{
      itemName: "HDPE Mat 6'x14'x4\", New, landed cost Dezhou China",
      description: "Termasuk freight, bea masuk, LC, cost of money", technicalSpec: null,
      quantity: 150, unit: "pcs", unitPrice: 50_802_000, discountPercent: 0, taxPercent: 11,
    }],
  }, sultonActor);
  console.log(`MBL first quotation created (${mblQuotation.number}) — kept as DRAFT, NOT submitted/sent, since this has never actually gone to the customer yet. Review and send manually when ready.`);

  // ---- Advance number sequences past what's already been issued in the
  // real world (SOP: a burned number must never be reused). Quotation
  // numbers up to 006/QUO/MKT/.../2026 exist in real files even though only
  // 002/003/005/006 above are represented as structured records here.
  // VENDOR_PO and INVOICE are advanced past "002" and "001" respectively —
  // see createRealVendorPO/createRealInvoice's own notes on why both real
  // invoices are coincidentally numbered "001" despite different months.
  await prisma.$transaction(async (tx) => {
    await tx.numberSequence.upsert({
      where: { entityType_year: { entityType: "QUOTATION", year: 2026 } },
      create: { entityType: "QUOTATION", year: 2026, prefix: "QUO/MKT", currentNumber: 6, padding: 3 },
      update: { currentNumber: 6 },
    });
    await tx.numberSequence.upsert({
      where: { entityType_year: { entityType: "VENDOR_PO", year: 2026 } },
      create: { entityType: "VENDOR_PO", year: 2026, prefix: "PO/PRO", currentNumber: 2, padding: 3 },
      update: { currentNumber: 2 },
    });
    await tx.numberSequence.upsert({
      where: { entityType_year: { entityType: "INVOICE", year: 2026 } },
      create: { entityType: "INVOICE", year: 2026, prefix: "INV/FIN", currentNumber: 2, padding: 3 },
      update: { currentNumber: 2 },
    });
  });

  console.log("Seeded 4 real customers/opportunities (3 Won -> Projects with folders migrated; 1 still Proposal).");
  console.log("Job Numbers set: 226 (JPC Jakarta), 326 (PT NCS), BPN-0505 / BPN-0506 (JPC Balikpapan).");
  console.log("Also seeded: JPC Jakarta Costing+VendorPO+DP Invoice+Progress Report, JPC Balikpapan VendorPO+Invoice+Additional Work quotation (pending), MBL Costing+first Quotation (draft).");
  console.log("\nSeed complete. Log in with any of the real accounts above (shared first-login password: Password123!).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
