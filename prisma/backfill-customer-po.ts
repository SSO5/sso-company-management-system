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
 * Requires PurchaseOrder.customerPO to exist — run AFTER
 * `npx prisma db push && npx prisma generate` on this schema change.
 *
 * Run:  npx tsx prisma/backfill-customer-po.ts          (dry run)
 *       npx tsx prisma/backfill-customer-po.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { generateNumber } from "../src/lib/numbering";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

type Spec = { job: "JKT" | "BPN"; customerPO: string; poDate: string; poValue: number; label: string };
const SPECS: Spec[] = [
  { job: "JKT", customerPO: "EPC-L/2026-0450", poDate: "2026-07-28", poValue: 355_200_000, label: "Overhoul 3x Gearbox Dodge Magnagear + Motor Brake" },
  { job: "BPN", customerPO: "2026/BPN-L-0505", poDate: "2026-07-20", poValue: 12_765_000, label: "Motor 45 kW 60 HP" },
  { job: "BPN", customerPO: "2026/BPN-L-0506", poDate: "2026-07-20", poValue: 36_075_000, label: "Motor 55 kW 75 HP" },
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

  const existing = await prisma.purchaseOrder.findMany({
    where: { deletedAt: null, customerPO: { in: SPECS.map((s) => s.customerPO) } },
    select: { customerPO: true },
  });
  const already = new Set(existing.map((e) => e.customerPO));

  for (const s of SPECS) {
    const p = proj(s.job);
    if (already.has(s.customerPO)) {
      console.log(`  SKIP ${s.customerPO}: sudah ada.`);
      continue;
    }
    console.log(`  [${s.job}] CREATE  ${s.customerPO}  ${s.poDate}  Rp ${s.poValue.toLocaleString("id-ID")}  (${s.label})`);
    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "PURCHASE_ORDER");
      await tx.purchaseOrder.create({
        data: {
          number,
          customerPO: s.customerPO,
          customerId: p.customerId,
          projectId: p.id,
          quotationId: p.quotationId ?? null,
          poDate: new Date(s.poDate),
          poValue: D(s.poValue),
          status: "VERIFIED",
          createdById: admin.id,
        },
      });
    });
  }

  console.log(APPLY ? "\nSelesai." : "\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
