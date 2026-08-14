/**
 * Splits the single Rp 19.184.000 payment that landed entirely on invoice
 * 001/INV/FIN/VII/2026 (Motor 45 kW DP) into its two real DP invoices —
 * this only became visible as a problem because reconcile-invoices-dp.ts
 * corrected invoice 001's grandTotal down from the wrong combined
 * 44.000.000 to the real 12.765.000, which made the untouched 19.184.000
 * payment look like a 6.419.000 overpayment (grandTotal - paidAmount going
 * negative).
 *
 * The split is NOT the two invoices' gross DP amounts (5.106.000 +
 * 14.430.000 = 19.536.000) — it is those amounts net of PPh 23 2%, which
 * JPC withholds the same way on Balikpapan as it does on Jakarta (verified:
 * Jakarta's own recorded payment, 69.760.000, is exactly 71.040.000 minus
 * 2% of the DPP DP 20% base of 64.000.000 = 1.280.000). Applying the same
 * mechanic here:
 *
 *   Invoice 001 (Motor 45kW): DPP DP 40% = 4.600.000, PPh 23 2% = 92.000
 *                             -> net 5.106.000 - 92.000 = 5.014.000
 *   Invoice 002 (Motor 55kW): DPP DP 40% = 13.000.000, PPh 23 2% = 260.000
 *                             -> net 14.430.000 - 260.000 = 14.170.000
 *
 *   5.014.000 + 14.170.000 = 19.184.000 — EXACTLY the amount already on
 *   file. The original combined payment was correct all along; it just
 *   needed to be attached to the right two invoices instead of one.
 *
 * The original payment row is soft-deleted (not hard-deleted) so the
 * original figure stays visible in a direct DB look if this ever needs
 * re-checking against the actual bank mutation.
 *
 * Run:  npx tsx prisma/split-bpn-payment.ts          (dry run)
 *       npx tsx prisma/split-bpn-payment.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

const SPLIT = [
  { invoiceNumber: "001/INV/FIN/VII/2026", grossDp: 5_106_000, dppDp: 4_600_000, pph23: 92_000, net: 5_014_000, label: "DP 40% Motor 45 kW" },
  { invoiceNumber: "002/INV/FIN/VII/2026", grossDp: 14_430_000, dppDp: 13_000_000, pph23: 260_000, net: 14_170_000, label: "DP 40% Motor 55 kW" },
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
  console.log(APPLY ? "MENERAPKAN pemisahan pembayaran...\n" : "[SIMULASI — tidak ada yang ditulis]\n");
  await warmUp();

  const inv001 = await prisma.invoice.findFirst({ where: { number: SPLIT[0].invoiceNumber, deletedAt: null } });
  if (!inv001) { console.error(`Invoice ${SPLIT[0].invoiceNumber} tidak ditemukan — jalankan reconcile-invoices-dp.ts --apply dulu.`); process.exit(1); }
  const inv002 = await prisma.invoice.findFirst({ where: { number: SPLIT[1].invoiceNumber, deletedAt: null } });
  if (!inv002) { console.error(`Invoice ${SPLIT[1].invoiceNumber} tidak ditemukan — jalankan reconcile-invoices-dp.ts --apply dulu.`); process.exit(1); }

  const existingPayment = await prisma.payment.findFirst({
    where: { invoiceId: inv001.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!existingPayment) { console.error(`Tidak ada payment aktif pada ${SPLIT[0].invoiceNumber} untuk dipecah.`); process.exit(1); }

  const totalNet = SPLIT.reduce((s, x) => s + x.net, 0);
  console.log(`   Payment lama : ${existingPayment.number}  Rp ${Number(existingPayment.amount).toLocaleString("id-ID")}  (seluruhnya di ${SPLIT[0].invoiceNumber})`);
  for (const s of SPLIT) {
    console.log(`   -> ${s.invoiceNumber}  ${s.label}: DPP DP ${s.dppDp.toLocaleString("id-ID")}  PPh23 2% ${s.pph23.toLocaleString("id-ID")}  net diterima ${s.net.toLocaleString("id-ID")}`);
  }
  console.log(`   Total net    : Rp ${totalNet.toLocaleString("id-ID")}  ${totalNet === Number(existingPayment.amount) ? "(pas, cocok dengan payment lama)" : "⚠ TIDAK cocok dengan payment lama — cek ulang sebelum apply"}`);

  if (!APPLY) {
    console.log("\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: existingPayment.id }, data: { deletedAt: new Date() } });

    const invoices = [inv001, inv002];
    for (let i = 0; i < SPLIT.length; i++) {
      const spec = SPLIT[i];
      const invoice = invoices[i];
      const seq = await tx.payment.count();
      await tx.payment.create({
        data: {
          number: `${String(seq + 1).padStart(3, "0")}/PAY/FIN/VIII/2026`,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          projectId: invoice.projectId,
          paymentDate: existingPayment.paymentDate,
          amount: D(spec.net),
          method: existingPayment.method,
          referenceNumber: existingPayment.referenceNumber,
          bankAccount: existingPayment.bankAccount,
          notes:
            `${spec.label} — DP kotor ${spec.grossDp.toLocaleString("id-ID")}, dipotong PPh 23 2% dari DPP DP (${spec.dppDp.toLocaleString("id-ID")}) ` +
            `= ${spec.pph23.toLocaleString("id-ID")}, net diterima ${spec.net.toLocaleString("id-ID")}. ` +
            `Dipecah dari ${existingPayment.number} (semula tercatat gabungan di satu invoice).`,
          createdById: existingPayment.createdById,
        },
      });

      const newPaidAmount = spec.net;
      const newStatus = newPaidAmount >= Number(invoice.grandTotal) ? "PAID" : "PARTIALLY_PAID";
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: D(newPaidAmount), status: newStatus as never } });
    }
  });

  console.log("\nSelesai.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
