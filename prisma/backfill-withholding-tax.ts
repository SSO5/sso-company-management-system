/**
 * Backfills Payment.withholdingTax / Invoice.withholdingTax for the three
 * payments that were already recorded NET of PPh 23 2% before those columns
 * existed (reconcile-invoices-dp.ts / split-bpn-payment.ts, both pre-dating
 * the withholdingTax field added in this same change).
 *
 * Those payments correctly recorded the CASH actually received — this script
 * does not change `amount` on any of them. It only fills in the tax-credit
 * side so invoiceOutstanding() stops treating the withheld PPh 23 as unpaid.
 *
 *   Jakarta   001/INV/FIN/VIII/2026: payment 69.760.000 (net) + PPh23 1.280.000 = DP due 71.040.000
 *   Balikpapan 001/INV/FIN/VII/2026: payment  5.014.000 (net) + PPh23    92.000 = DP due  5.106.000
 *   Balikpapan 002/INV/FIN/VII/2026: payment 14.170.000 (net) + PPh23   260.000 = DP due 14.430.000
 *
 * Requires the withholdingTax columns to exist — run AFTER
 * `npx prisma db push && npx prisma generate` on this schema change.
 *
 * Run:  npx tsx prisma/backfill-withholding-tax.ts          (dry run)
 *       npx tsx prisma/backfill-withholding-tax.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

const BACKFILL = [
  { invoiceNumber: "001/INV/FIN/VIII/2026", expectedNetPayment: 69_760_000, pph23: 1_280_000, label: "JKT DP 20%" },
  { invoiceNumber: "001/INV/FIN/VII/2026", expectedNetPayment: 5_014_000, pph23: 92_000, label: "BPN Motor 45kW DP 40%" },
  { invoiceNumber: "002/INV/FIN/VII/2026", expectedNetPayment: 14_170_000, pph23: 260_000, label: "BPN Motor 55kW DP 40%" },
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
  console.log(APPLY ? "MENERAPKAN backfill PPh 23...\n" : "[SIMULASI — tidak ada yang ditulis]\n");
  await warmUp();

  for (const spec of BACKFILL) {
    const invoice = await prisma.invoice.findFirst({ where: { number: spec.invoiceNumber, deletedAt: null } });
    if (!invoice) { console.log(`  SKIP ${spec.invoiceNumber}: invoice tidak ditemukan.`); continue; }

    const payment = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) { console.log(`  SKIP ${spec.invoiceNumber}: tidak ada payment aktif.`); continue; }

    const actualAmount = Number(payment.amount);
    const match = actualAmount === spec.expectedNetPayment;
    console.log(
      `  ${spec.invoiceNumber} (${spec.label})  payment ${payment.number}: Rp ${actualAmount.toLocaleString("id-ID")}` +
        (match ? "" : `  ⚠ EXPECTED Rp ${spec.expectedNetPayment.toLocaleString("id-ID")} — cek ulang sebelum apply, dilewati.`) +
        `  -> set withholdingTax Rp ${spec.pph23.toLocaleString("id-ID")}`
    );
    if (!match) continue;

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { withholdingTax: D(spec.pph23) } });
        const newWithholding = Number(invoice.withholdingTax) + spec.pph23;
        await tx.invoice.update({ where: { id: invoice.id }, data: { withholdingTax: D(newWithholding) } });
      });
    }
  }

  console.log(APPLY ? "\nSelesai." : "\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
