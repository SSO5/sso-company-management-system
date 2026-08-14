/**
 * Same failure as reconcile-jpc.ts, different module: the auto-generated
 * Invoice records for JPC Jakarta and JPC Balikpapan billed 100% of the
 * contract value with no VAT, when the real invoices actually sent to the
 * customer are staged DP (down-payment) invoices — 20% for Jakarta, 40%
 * each for the two separate Balikpapan jobs — with VAT correctly applied
 * BEFORE the DP percentage is taken, not skipped.
 *
 * Every figure below is read directly off the real, already-issued invoice
 * PDFs (PROSPEK 2026/.../02 Finance/Invoice). The formula the app already
 * uses for a DP invoice — grandTotal * dpPercent/100 — is correct and
 * reproduces the real "TOTAL AMOUNT DUE" line exactly once subtotal/tax/
 * grandTotal are the FULL (100%, VAT-inclusive) job value:
 *
 *   Jakarta:     325.917.000 - 5.917.000 disc = 320.000.000 netto
 *                + 35.200.000 PPN 11% = 355.200.000 grand total
 *                x 20% DP = 71.040.000  (matches "TOTAL AMOUNT DP DUE")
 *
 *   Balikpapan job 1 (Motor 45kW): 11.500.000 + 1.265.000 PPN = 12.765.000
 *                x 40% DP = 5.106.000  (matches invoice 001)
 *   Balikpapan job 2 (Motor 55kW): 32.500.000 + 3.575.000 PPN = 36.075.000
 *                x 40% DP = 14.430.000 (matches invoice 002 — has a real
 *                Faktur Pajak already filed with DJP, no. seri
 *                04002600302911138, issued 6 Aug 2026)
 *
 * Balikpapan currently has ONE invoice in the app billing the full
 * 44.000.000 (11.500.000 + 32.500.000, the two jobs' combined DPP) with no
 * tax and no DP staging at all — it becomes invoice 001 below, and 002 is
 * created fresh since it never existed as a separate row.
 *
 * The remaining stages (80% before delivery for Jakarta; 50% before
 * delivery + 10% retention for each Balikpapan job) are NOT invoiced yet —
 * on purpose. Those get created for real when the project actually reaches
 * that milestone, not backfilled speculatively here.
 *
 * Run:  npx tsx prisma/reconcile-invoices-dp.ts          (dry run)
 *       npx tsx prisma/reconcile-invoices-dp.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

type InvoiceItemSpec = [group: string, desc: string, amount: number];
type InvoiceSpec = {
  job: "JKT" | "BPN";
  number: string;
  invoiceDate: string;
  dueDate: string;
  customerPO: string;
  poDate: string;
  jobNo: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  dpPercent: number;
  items: InvoiceItemSpec[];
  notes: string;
};

const INVOICES: InvoiceSpec[] = [
  {
    job: "JKT",
    number: "001/INV/FIN/VIII/2026",
    invoiceDate: "2026-08-05",
    dueDate: "2026-08-19",
    customerPO: "EPC-L/2026-0450",
    poDate: "2026-07-28",
    jobNo: "JO-2607-003",
    subtotal: 325_917_000,
    discount: 5_917_000,
    tax: 35_200_000,
    grandTotal: 355_200_000,
    dpPercent: 20,
    items: [
      ["1. OVERHOUL GEARBOX DODGE MAGNAGEAR 100K", "Gearbox Drive Unit 6804", 100_000_000],
      ["2. OVERHOUL GEARBOX DODGE MAGNAGEAR 100K", "Gearbox Drive Unit 6805", 100_000_000],
      ["3. OVERHOUL GEARBOX DODGE MAGNAGEAR 100K", "Gearbox Drive Unit 6806", 100_000_000],
      ["4. MOTOR BRAKE ASSEMBLY REPAIR", "Bearing replacement (2 pcs)", 4_000_000],
      ["5. MOTOR BRAKE ASSEMBLY REPAIR", "Mechanical seal replacement (2 pcs)", 2_000_000],
      ["6. MOTOR BRAKE ASSEMBLY REPAIR", "Painting", 667_000],
      ["7. TRANSPORTATION", "Logistik/akomodasi pickup & return Gearbox di JPC Workshop", 3_500_000],
      ["8. OPERATION COST", "Operation cost", 15_750_000],
    ],
    notes:
      "DP 20% dari total kontrak setelah diskon (320.000.000) + PPN 11% (35.200.000) = 355.200.000. " +
      "Sisa 80% ditagih sebelum delivery (belum dibuat). Delivery: Second Week of August 2026. " +
      "Harga sudah termasuk Meggering Test, pengukuran RPM/Voltage/Current, alignment motor & pemasangan shaft, pemasangan base plate, tes performa. " +
      "Diverifikasi terhadap PDF invoice asli 001/INV/FIN/VIII/2026.",
  },
  {
    job: "BPN",
    number: "001/INV/FIN/VII/2026",
    invoiceDate: "2026-07-23",
    dueDate: "2026-08-06",
    customerPO: "2026/BPN-L-0505",
    poDate: "2026-07-20",
    jobNo: "2671",
    subtotal: 11_500_000,
    discount: 0,
    tax: 1_265_000,
    grandTotal: 12_765_000,
    dpPercent: 40,
    items: [
      ["", "Motor 45 kW 60 HP Gearbox Overhaul", 9_500_000],
      ["", "Motor 45 kW 60 HP Replacement of Mechanical Seal", 2_000_000],
    ],
    notes:
      "DP 40% dari nilai pekerjaan Motor 45 kW (12.765.000 termasuk PPN 11%) = 5.106.000. " +
      "Sisa: 50% sebelum delivery, 10% retensi (belum dibuat). Delivery: 6 minggu setelah DP diterima. " +
      "Diverifikasi terhadap PDF invoice asli 001/INV/FIN/VII/2026.",
  },
  {
    job: "BPN",
    number: "002/INV/FIN/VII/2026",
    invoiceDate: "2026-07-23",
    dueDate: "2026-08-06",
    customerPO: "2026/BPN-L-0506",
    poDate: "2026-07-20",
    jobNo: "2671",
    subtotal: 32_500_000,
    discount: 0,
    tax: 3_575_000,
    grandTotal: 36_075_000,
    dpPercent: 40,
    items: [
      ["", "Motor 55 kW 75 HP Motor Rewinding", 18_000_000],
      ["", "Motor 55 kW 75 HP Replacement of Bearing 6313 SKF ZZ C3 (2 pcs)", 5_000_000],
      ["", "Motor 55 kW 75 HP Replacement of Mechanical Seal", 2_000_000],
      ["", "Motor 55 kW 75 HP Cover Welding & Lathe Work", 2_500_000],
      ["", "Motor 55 kW 75 HP Rotor Balancing", 5_000_000],
    ],
    notes:
      "DP 40% dari nilai pekerjaan Motor 55 kW (36.075.000 termasuk PPN 11%) = 14.430.000. " +
      "Faktur Pajak sudah terbit ke DJP: no. seri 04002600302911138, tanggal 6 Agustus 2026. " +
      "Sisa: 50% sebelum delivery, 10% retensi (belum dibuat). Delivery: 6 minggu setelah DP diterima. " +
      "Diverifikasi terhadap PDF invoice asli 002/INV/FIN/VII/2026 dan Faktur Pajak.",
  },
];

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
  console.log(APPLY ? "MENERAPKAN koreksi invoice DP...\n" : "[SIMULASI — tidak ada yang ditulis]\n");
  await warmUp();

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, number: true, customerId: true, customer: { select: { companyName: true } } },
  });
  const jkt = projects.find((p) => /jakarta prima/i.test(p.customer.companyName) && !/balikpapan/i.test(p.customer.companyName));
  const bpn = projects.find((p) => /balikpapan/i.test(p.customer.companyName));
  if (!jkt || !bpn) { console.error("Proyek JPC Jakarta / Balikpapan tidak ditemukan."); process.exit(1); }
  const proj = (k: "JKT" | "BPN") => (k === "JKT" ? jkt : bpn);

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!admin) { console.error("Tidak ada ADMIN aktif."); process.exit(1); }
  const salesPic = await prisma.user.findFirst({ where: { name: { contains: "Yohana", mode: "insensitive" }, isActive: true } });

  // Existing invoices per project, oldest first — the first (and, per the
  // founder's own check, currently only) row per job is the one that was
  // auto-generated wrong and gets converted in place. Anything beyond that
  // is created fresh.
  const existingByJob: Record<"JKT" | "BPN", { id: string; number: string; salesPicId: string | null; quotationId: string | null }[]> = {
    JKT: await prisma.invoice.findMany({ where: { projectId: jkt.id, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, salesPicId: true, quotationId: true } }),
    BPN: await prisma.invoice.findMany({ where: { projectId: bpn.id, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, salesPicId: true, quotationId: true } }),
  };
  const cursor: Record<"JKT" | "BPN", number> = { JKT: 0, BPN: 0 };

  for (const inv of INVOICES) {
    const p = proj(inv.job);
    const pool = existingByJob[inv.job];
    const takeExisting = pool[cursor[inv.job]];
    cursor[inv.job] += 1;

    const action = takeExisting ? `UPDATE (dari ${takeExisting.number})` : "CREATE baru";
    console.log(
      `   [${inv.job}] ${action.padEnd(28)} -> ${inv.number}  DP ${inv.dpPercent}%  ` +
      `nilai penuh ${inv.grandTotal.toLocaleString("id-ID")}  tagihan ${(inv.grandTotal * inv.dpPercent / 100).toLocaleString("id-ID")}`
    );
    if (!APPLY) continue;

    const data = {
      number: inv.number,
      invoiceDate: new Date(inv.invoiceDate),
      dueDate: new Date(inv.dueDate),
      customerPO: inv.customerPO,
      poDate: new Date(inv.poDate),
      jobNo: inv.jobNo,
      salesPicId: takeExisting?.salesPicId ?? salesPic?.id ?? null,
      subtotal: D(inv.subtotal),
      discount: D(inv.discount),
      tax: D(inv.tax),
      grandTotal: D(inv.grandTotal),
      dpPercent: D(inv.dpPercent),
      status: "ISSUED" as const,
      notes: inv.notes,
    };

    const id = takeExisting
      ? (await prisma.invoice.update({ where: { id: takeExisting.id }, data })).id
      : (await prisma.invoice.create({
          data: {
            ...data,
            projectId: p.id,
            customerId: p.customerId,
            createdById: admin.id,
          } as never,
        })).id;

    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoiceItem.createMany({
      data: inv.items.map(([group, desc, amount], i) => ({
        invoiceId: id,
        groupLabel: group || null,
        description: desc,
        quantity: D(1),
        unit: "lot",
        unitPrice: D(amount),
        taxPercent: D(11),
        total: D(amount),
        sortOrder: i,
      })),
    });
  }

  console.log(
    APPLY
      ? "\nSelesai. Jalankan `npx tsx prisma/sync-number-sequences.ts` setelah ini " +
        "supaya nomor invoice berikutnya yang dibuat otomatis tidak bentrok dengan 001/002 di atas."
      : "\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n"
  );
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
