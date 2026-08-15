/**
 * Creates the real customer PurchaseOrder records for JPC Jakarta and JPC
 * Balikpapan — these never existed as PurchaseOrder rows (only as
 * Invoice.customerPO free text), which is why the "Customer Purchase Order"
 * card on the project's Documents tab showed "No customer PO recorded" even
 * after the real PO file was uploaded as a Document. A Document is a file;
 * this is the structured record the Documents tab actually reads from.
 *
 * Figures verified directly against the real, OCR'd PO PDFs (PROSPEK 2026/
 * .../01 Sales/5. PO) — poValue is the FULL contract value on each PO (same
 * "TOTAL"/"Total Amount" line), not the DP portion:
 *
 *   JKT  EPC-L/2026-0450     28 Jul 2026   Rp 355.200.000
 *   BPN  2026/BPN-L-0505     20 Jul 2026   Rp  12.765.000  (Motor 45 kW)
 *   BPN  2026/BPN-L-0506     20 Jul 2026   Rp  36.075.000  (Motor 55 kW)
 *
 * Status VERIFIED for all three — each is the real, already-confirmed basis
 * of work actively in progress (not a pending/unconfirmed PO).
 *
 * paymentTerms/deliveryTerms are read straight off the same real PO PDFs
 * (OCR'd earlier this session) — this is what makes the "Sisa Penagihan"
 * card on the Documents tab able to show what the next billing stage
 * actually is, instead of that being a one-off chat answer. estimatedDeliveryDate
 * is a calendar date derived from deliveryTerms + poDate (same rule the AI
 * extractor uses) so the UI can show a concrete next-billing target date
 * instead of just the raw term text.
 *
 * Safe to re-run: if a PO already exists (e.g. from an earlier run before
 * paymentTerms/estimatedDeliveryDate existed), it fills in whichever of the
 * two is still missing instead of skipping — never touches poValue/poDate/
 * status on an existing row.
 *
 * Requires PurchaseOrder.paymentTerms/deliveryTerms/estimatedDeliveryDate to
 * exist — run AFTER `npx prisma db push && npx prisma generate` on this
 * schema change.
 *
 * Run:  npx tsx prisma/backfill-customer-po.ts          (dry run)
 *       npx tsx prisma/backfill-customer-po.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

// `number` IS the customer's own PO reference (see schema.prisma — no SSO
// sequence is invented for a document SSO did not issue).
type Spec = {
  job: "JKT" | "BPN"; number: string; poDate: string; poValue: number; label: string;
  paymentTerms: string; deliveryTerms: string; estimatedDeliveryDate: string;
};
const SPECS: Spec[] = [
  {
    job: "JKT", number: "EPC-L/2026-0450", poDate: "2026-07-28", poValue: 355_200_000,
    label: "Overhoul 3x Gearbox Dodge Magnagear + Motor Brake",
    paymentTerms: "20% DP; 80% Cash Before Delivery",
    deliveryTerms: "Pekerjaan selesai Minggu ke 2 bulan Agustus 2026",
    // "Minggu ke 2 Agustus 2026" — tidak presisi tanggal, dipakai tanggal 14
    // sebagai representasi (sama seperti aturan yang dipakai AI extractor).
    estimatedDeliveryDate: "2026-08-14",
  },
  {
    job: "BPN", number: "2026/BPN-L-0505", poDate: "2026-07-20", poValue: 12_765_000,
    label: "Motor 45 kW 60 HP",
    paymentTerms: "40% DP, 50% Before Delivered, & 10% Retention",
    deliveryTerms: "ETA MAX 6 Weeks ARO",
    // ARO = After Receipt of Order -> poDate + 6 minggu = 31 Agustus 2026.
    estimatedDeliveryDate: "2026-08-31",
  },
  {
    job: "BPN", number: "2026/BPN-L-0506", poDate: "2026-07-20", poValue: 36_075_000,
    label: "Motor 55 kW 75 HP",
    paymentTerms: "40% DP, 50% Before Delivered, & 10% Retention",
    deliveryTerms: "ETA MAX 6 Weeks ARO",
    estimatedDeliveryDate: "2026-08-31",
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
  console.log(APPLY ? "MENERAPKAN pembuatan Customer PO...\n" : "[SIMULASI — tidak ada yang ditulis]\n");
  await warmUp();

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, customerId: true, quotationId: true, customer: { select: { companyName: true } } },
  });
  const jkt = projects.find((p) => /jakarta prima/i.test(p.customer.companyName) && !/balikpapan/i.test(p.customer.companyName));
  const bpn = projects.find((p) => /balikpapan/i.test(p.customer.companyName));
  if (!jkt || !bpn) { console.error("Proyek JPC Jakarta / Balikpapan tidak ditemukan."); process.exit(1); }
  const proj = (k: "JKT" | "BPN") => (k === "JKT" ? jkt! : bpn!);

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!admin) { console.error("Tidak ada ADMIN aktif."); process.exit(1); }

  for (const s of SPECS) {
    const p = proj(s.job);
    const existing = await prisma.purchaseOrder.findFirst({
      where: { customerId: p.customerId, number: s.number, deletedAt: null },
    });

    if (existing) {
      if (existing.paymentTerms && existing.estimatedDeliveryDate) {
        console.log(`  SKIP ${s.number}: sudah ada, term of payment & perkiraan tanggal sudah terisi.`);
        continue;
      }
      console.log(`  [${s.job}] UPDATE  ${s.number}  -> mengisi payment/delivery terms + perkiraan tanggal`);
      if (!APPLY) continue;
      await prisma.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          paymentTerms: existing.paymentTerms ?? s.paymentTerms,
          deliveryTerms: existing.deliveryTerms ?? s.deliveryTerms,
          estimatedDeliveryDate: existing.estimatedDeliveryDate ?? new Date(s.estimatedDeliveryDate),
        },
      });
      continue;
    }

    console.log(`  [${s.job}] CREATE  ${s.number}  ${s.poDate}  Rp ${s.poValue.toLocaleString("id-ID")}  (${s.label})`);
    if (!APPLY) continue;

    await prisma.purchaseOrder.create({
      data: {
        number: s.number,
        customerId: p.customerId,
        projectId: p.id,
        quotationId: p.quotationId ?? null,
        poDate: new Date(s.poDate),
        poValue: D(s.poValue),
        paymentTerms: s.paymentTerms,
        deliveryTerms: s.deliveryTerms,
        estimatedDeliveryDate: new Date(s.estimatedDeliveryDate),
        status: "VERIFIED",
        createdById: admin.id,
      },
    });
  }

  console.log(APPLY ? "\nSelesai." : "\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
