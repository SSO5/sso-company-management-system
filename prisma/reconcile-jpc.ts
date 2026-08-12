/**
 * Correct the reconstructed records to match the source documents.
 *
 * Every figure below was read from the document itself — text layer where the
 * PDF had one, Tesseract OCR where the tables were pasted as images (quotation
 * R3/R4, customer PO 0450, vendor invoices). Nothing here is inferred.
 *
 * WHAT WAS WRONG
 *
 * 1. The winning quotation was stored as revision 4. The customer PO proves
 *    otherwise: PO EPC-L/2026-0450 is 320.000.000 netto, which matches
 *    R3-final-nego (discount 5.917.000). R4 was a cheaper alternative offer
 *    (discount 10.917.000 -> 315.000.000) that JPC did not take. Left as-is,
 *    any "how much discount did we give to win" analysis answers 10.917.000
 *    when the real figure is 5.917.000.
 *
 * 2. Only the final revision existed. R0-R4 are now separate rows, because the
 *    negotiation IS the sales record — losing it means losing the only
 *    evidence of how a price was arrived at.
 *
 * 3. Vendor POs were reconstructions. Both are to PT Athena Teknik Perkasa:
 *    PO 001 -> Balikpapan (42.000.000), PO 002 -> Jakarta (119.602.500).
 *    An earlier reading had attributed PO 001 to Genfa/Hendro because the
 *    covering email was addressed to him; the PO document itself names Athena.
 *
 * 4. Athena's invoices to SSO and the DP payments were absent entirely — the
 *    app had no record that money had gone out. Recorded here as project
 *    expenses so vendor cost finally reaches project profitability.
 *
 * Run:  npx tsx prisma/reconcile-jpc.ts          (dry run, prints the plan)
 *       npx tsx prisma/reconcile-jpc.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

// ---------------------------------------------------------------- data
const QUOTATION_CHAIN = [
  { rev: 0, number: "Quot-00226", date: "2026-04-29", subtotal: 300_000_000, discount: 0, taxPercent: 12, terms: "50% DP / 50% sebelum delivery", status: "SUPERSEDED" },
  { rev: 1, number: "Quot-00226.R1", date: "2026-05-13", subtotal: 315_000_000, discount: 10_000_000, taxPercent: 12, terms: "50% DP / 50% sebelum delivery", status: "SUPERSEDED" },
  { rev: 2, number: "Quot-00226.R2", date: "2026-05-26", subtotal: 315_000_000, discount: 15_000_000, taxPercent: 12, terms: "50% DP / 50% sebelum delivery", status: "SUPERSEDED" },
  // R3 (17 Jul) carried the new numbering but its price table is an image and
  // the totals are not legible even by OCR; recorded without figures rather
  // than guessed, and flagged in the notes.
  { rev: 3, number: "002/QUO/MKT/V/2026.R3", date: "2026-07-17", subtotal: null, discount: null, taxPercent: 12, terms: "50% DP / 50% sebelum delivery", status: "SUPERSEDED" },
  { rev: 4, number: "002/QUO/MKT/V/2026.R3.", date: "2026-07-23", subtotal: 325_917_000, discount: 5_917_000, taxPercent: 11, terms: "20% DP / 80% sebelum delivery", status: "WON" },
  { rev: 5, number: "002/QUO/MKT/V/2026.R4", date: "2026-07-23", subtotal: 325_917_000, discount: 10_917_000, taxPercent: 11, terms: "20% DP / 80% sebelum delivery", status: "LOST" },
];

const VENDOR_POS = [
  {
    number: "001/PO/PRO/VII/2026", poDate: "2026-07-23", job: "BPN",
    quotationRef: "ATP26-VII/Ext/12", projectRef: "2026/BPN-L-0505",
    subtotal: 40_000_000, discount: 2_162_000, taxPercent: 11, tax: 4_162_162, grandTotal: 42_000_000,
    items: [
      ["MOTOR 55 KW 75 HP", "Rewinding Motor", 17_500_000],
      ["MOTOR 55 KW 75 HP", "Penggantian bearing 6313 SKF ZZ C3 (2 pc)", 5_000_000],
      ["MOTOR 55 KW 75 HP", "Penggantian mechanical seal", 2_000_000],
      ["MOTOR 55 KW 75 HP", "Las bubut cover", 2_500_000],
      ["MOTOR 55 KW 75 HP", "Balancing rotor", 5_000_000],
      ["MOTOR 45 KW 60 HP", "Overhoul gearbox", 6_500_000],
      ["MOTOR 45 KW 60 HP", "Penggantian mechanical seal", 2_000_000],
    ] as [string, string, number][],
  },
  {
    number: "002/PO/PRO/VII/2026", poDate: "2026-07-28", job: "JKT",
    quotationRef: "ATP26-VII/Ext/14", projectRef: "EPC-L/2026-0450",
    subtotal: 107_750_000, discount: 0, taxPercent: 11, tax: 11_852_500, grandTotal: 119_602_500,
    items: [
      ["GEARBOX DODGE", "Overhoul Gearbox Dodge Magnager 100k", 89_250_000],
      ["GEARBOX DODGE", "Repair Rangkaian Motor Break", 3_000_000],
      ["GEARBOX DODGE", "Repair Rangkaian Motor Break", 11_000_000],
      ["GEARBOX DODGE", "Installation Kopel And Baseplate", 4_500_000],
    ] as [string, string, number][],
  },
];

// Athena's invoices to SSO, and the DP actually paid on 8 Aug 2026.
// PPh 23 is 2% of the VAT-exclusive base; the payment memo's "PPN 12%" label
// is a typo — both invoices and both POs state 11%, and the withholding
// arithmetic only reconciles at 11%.
const VENDOR_BILLS = [
  {
    job: "BPN", vendorInvoice: "ATP26-INV07011", invoiceDate: "2026-07-24", poRef: "001/PO/PRO/VII/2026",
    total: 42_000_000, netto: 37_837_838, tax: 4_162_162,
    dpPercent: 30, dpGross: 12_600_000, pph23: 227_027, dpNet: 12_372_973, paidOn: "2026-08-08",
  },
  {
    job: "JKT", vendorInvoice: "ATP26-INV07012", invoiceDate: "2026-07-30", poRef: "002/PO/PRO/VII/2026",
    total: 119_602_500, netto: 107_750_000, tax: 11_852_500,
    dpPercent: 30, dpGross: 35_880_750, pph23: 646_500, dpNet: 35_234_250, paidOn: "2026-08-08",
  },
];

// Progress report series. 003 and 004 keep their numbers — both were already
// issued to JPC, and renumbering a document the customer holds breaks the
// reference. 001 and 002 backfill the gap with the two earlier reports whose
// content is of the same kind.
const PROGRESS_REPORTS = [
  { number: "ENG-REP-001", date: "2026-07-25", title: "Hasil Pengecekan Setelah Pembongkaran Motor dan Gearbox", kind: "PEMERIKSAAN" },
  { number: "ENG-REP-002", date: "2026-07-28", title: "Progres Perbaikan Gearbox Dodge", kind: "PROGRES" },
  { number: "ENG-REP-003", date: "2026-08-07", title: "Identifikasi Bearing & Kebutuhan Spare Parts", kind: "PEMERIKSAAN" },
  { number: "ENG-REP-004", date: "2026-08-09", title: "Progress Pengerjaan Perbaikan Motor dan Gearbox", kind: "PROGRES" },
];

/**
 * Neon's serverless compute suspends after a few minutes idle. The first
 * connection has to wake it, and that wake takes longer than Prisma's 10s pool
 * timeout — so a cold script dies with "Timed out fetching a new connection"
 * before the database has even finished starting. It then works on the second
 * attempt, which makes the failure look random when it is completely
 * predictable.
 *
 * A trivial query with retries absorbs the wake-up. Cheaper than telling
 * someone to "just run it twice".
 */
async function warmUp(attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (i > 1) console.log(`(database bangun setelah percobaan ke-${i})\n`);
      return;
    } catch (e) {
      if (i === attempts) throw e;
      console.log(`Database belum siap, mencoba lagi (${i}/${attempts - 1})...`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

async function main() {
  console.log(APPLY ? "MENERAPKAN koreksi...\n" : "[SIMULASI — tidak ada yang ditulis]\n");
  await warmUp();

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, number: true, customer: { select: { companyName: true } } },
  });
  const jkt = projects.find((p) => /jakarta prima/i.test(p.customer.companyName) && !/balikpapan/i.test(p.customer.companyName));
  const bpn = projects.find((p) => /balikpapan/i.test(p.customer.companyName));
  if (!jkt || !bpn) { console.error("Proyek JPC Jakarta / Balikpapan tidak ditemukan."); process.exit(1); }
  const job = (k: string) => (k === "JKT" ? jkt : bpn);

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!admin) { console.error("Tidak ada ADMIN aktif."); process.exit(1); }

  // ---------------------------------------------------- 1. quotations
  console.log("1. RANTAI QUOTATION JPC JAKARTA");
  const opp = await prisma.quotation.findFirst({
    where: { opportunity: { customer: { companyName: { contains: "Jakarta Prima", mode: "insensitive" } } }, deletedAt: null },
    select: { opportunityId: true, customerId: true, salesPicId: true, createdById: true },
  });
  if (!opp) { console.error("Quotation JPC Jakarta tidak ditemukan sebagai acuan."); process.exit(1); }

  for (const q of QUOTATION_CHAIN) {
    const netto = q.subtotal === null ? null : q.subtotal - (q.discount ?? 0);
    const tax = netto === null ? null : Math.round((netto * q.taxPercent) / 100);
    const grand = netto === null ? null : netto + (tax ?? 0);
    console.log(
      `   ${q.status.padEnd(11)} ${q.number.padEnd(26)} ${q.date}  ` +
      (netto === null ? "angka tidak terbaca (tabel berupa gambar)" : `netto ${netto.toLocaleString("id-ID")}  PPN ${q.taxPercent}%  total ${grand!.toLocaleString("id-ID")}`)
    );
    if (!APPLY) continue;

    const existing = await prisma.quotation.findFirst({ where: { number: q.number } });
    // Quotation stores `tax` as an absolute amount — there is no taxPercent
    // column — so the rate that produced it is recorded in the notes instead.
    // That matters here: the rate genuinely changed mid-negotiation, 12% on
    // R0-R3 and 11% from R3-final-nego onward, and without it written down the
    // jump in tax between revisions looks like an error rather than a fact.
    const data = {
      revision: q.rev,
      quotationDate: new Date(q.date),
      subtotal: D(q.subtotal ?? 0), discount: D(q.discount ?? 0),
      tax: D(tax ?? 0), grandTotal: D(grand ?? 0),
      terms: q.terms,
      status: (q.status === "WON" ? "WON" : q.status === "LOST" ? "LOST" : "EXPIRED") as never,
      notes: q.subtotal === null
        ? `PPN ${q.taxPercent}%. Angka tidak dapat diverifikasi: tabel harga pada PDF asli berupa gambar dan tidak terbaca OCR.`
        : `PPN ${q.taxPercent}%. Diverifikasi terhadap PDF asli (OCR untuk R3/R4).`,
    };
    if (existing) await prisma.quotation.update({ where: { id: existing.id }, data });
    else await prisma.quotation.create({
      data: {
        ...data, number: q.number,
        opportunityId: opp.opportunityId, customerId: opp.customerId,
        salesPicId: opp.salesPicId, createdById: admin.id,
        subjectLine: "Quotation — Gearbox Drive Unit Maintenance & Servicing",
        validUntil: new Date(new Date(q.date).getTime() + 14 * 864e5),
      } as never,
    });
  }

  // ---------------------------------------------------- 2. vendor POs
  console.log("\n2. PO KE VENDOR (keduanya ke PT Athena Teknik Perkasa)");
  for (const po of VENDOR_POS) {
    const p = job(po.job);
    console.log(`   ${po.number}  ${po.poDate}  ${p.number}  total ${po.grandTotal.toLocaleString("id-ID")}  (${po.items.length} baris)`);
    if (!APPLY) continue;
    const existing = await prisma.vendorPurchaseOrder.findFirst({ where: { number: po.number } });
    const base = {
      vendorName: "PT Athena Teknik Perkasa",
      vendorAddress: "Kampung Gaok RT 03 RW 01, Desa Mukti Jaya, Kec. Setu, Kab. Bekasi",
      vendorEmail: "athenateknikperkasa@gmail.com",
      vendorAttn: "Bp. Kodrat AS (081310808961)",
      poDate: new Date(po.poDate), quotationRef: po.quotationRef, projectRef: po.projectRef,
      paymentTerms: "30% DP setelah PO, 70% setelah pekerjaan selesai",
      subtotal: D(po.subtotal), discount: D(po.discount), taxPercent: D(po.taxPercent),
      tax: D(po.tax), grandTotal: D(po.grandTotal), projectId: p.id,
      notes: "Biaya sudah termasuk PPN 11%. Diverifikasi terhadap PDF PO asli.",
    };
    const id = existing
      ? (await prisma.vendorPurchaseOrder.update({ where: { id: existing.id }, data: base })).id
      : (await prisma.vendorPurchaseOrder.create({ data: { ...base, number: po.number, createdById: admin.id, status: "SENT" } as never })).id;
    await prisma.vendorPurchaseOrderItem.deleteMany({ where: { vendorPurchaseOrderId: id } });
    await prisma.vendorPurchaseOrderItem.createMany({
      data: po.items.map(([group, desc, amount], i) => ({
        vendorPurchaseOrderId: id, groupLabel: group, description: desc,
        quantity: D(1), unit: "Lot", unitPrice: D(amount), amount: D(amount), sortOrder: i,
      })),
    });
  }

  // ---------------------------------------------- 3. vendor bills + DP
  console.log("\n3. TAGIHAN VENDOR & PEMBAYARAN DP (sebelumnya tidak tercatat sama sekali)");
  for (const b of VENDOR_BILLS) {
    const p = job(b.job);
    console.log(`   ${b.vendorInvoice}  ${p.number}  tagihan ${b.total.toLocaleString("id-ID")}  DP ${b.dpGross.toLocaleString("id-ID")}  PPh23 ${b.pph23.toLocaleString("id-ID")}  netto transfer ${b.dpNet.toLocaleString("id-ID")}`);
    if (!APPLY) continue;
    const desc = `Athena ${b.vendorInvoice} — DP ${b.dpPercent}% atas PO ${b.poRef}`;
    const existing = await prisma.projectExpense.findFirst({ where: { projectId: p.id, description: desc, deletedAt: null } });
    if (existing) continue;
    const seq = await prisma.projectExpense.count();
    await prisma.projectExpense.create({
      data: {
        number: `${String(seq + 1).padStart(3, "0")}/EXP/FIN/VIII/2026`,
        projectId: p.id, category: "VENDOR", description: desc,
        vendor: "PT Athena Teknik Perkasa", date: new Date(b.paidOn),
        // Split the DP into its VAT-exclusive base and the 11% VAT on top, so
        // project cost reflects the base and the tax is not double-counted.
        amount: D(Math.round(b.dpGross / 1.11)),
        tax: D(b.dpGross - Math.round(b.dpGross / 1.11)),
        total: D(b.dpGross),
        paymentStatus: "PAID", approvalStatus: "APPROVED",
        approvedAt: new Date(b.paidOn), approvedById: admin.id, createdById: admin.id,
        // The bank detail is kept, not erased: the shareholder fronted this DP
        // because of a transfer limit and has since been reimbursed, so the
        // economic reality is SSO -> Athena. The statement still needs to
        // reconcile, and the proof of settlement needs somewhere to attach.
        notes:
          `Dibayar ${b.paidOn}. PPh 23 2% = ${b.pph23.toLocaleString("id-ID")} dipotong, netto transfer ${b.dpNet.toLocaleString("id-ID")}. ` +
          `Dicatat sebagai transfer rekening SSO ke rekening PT Athena Teknik Perkasa (BCA 5222258341). ` +
          `Catatan: DP ini semula ditalangi pemegang saham karena limit rekening, dan telah diselesaikan — bukti menyusul. ` +
          `Sisa kewajiban 70% = ${(b.total - b.dpGross).toLocaleString("id-ID")}.`,
      } as never,
    });
  }

  // ---------------------------------------------- 4. progress reports
  console.log("\n4. SERI PROGRESS REPORT (003 & 004 tidak diubah — sudah terkirim ke JPC)");
  for (const r of PROGRESS_REPORTS) {
    console.log(`   ${r.number}  ${r.date}  [${r.kind}]  ${r.title}`);
    if (!APPLY) continue;
    const existing = await prisma.progressReport.findFirst({ where: { number: r.number } });
    const data = {
      inspectionDate: new Date(r.date), location: "Workshop SSO",
      title: r.title, reportKind: r.kind,
    } as never;
    if (existing) await prisma.progressReport.update({ where: { id: existing.id }, data });
    else await prisma.progressReport.create({
      data: { ...(data as object), number: r.number, projectId: jkt.id, preparedById: admin.id, createdById: admin.id } as never,
    });
  }

  console.log(APPLY ? "\nSelesai." : "\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
