/**
 * Populates real ProjectMilestone rows for JPC Jakarta (JKT) and JPC
 * Balikpapan (BPN) from the same real PO payment terms already backfilled
 * onto PurchaseOrder (see backfill-customer-po.ts) — weightPercent sums to
 * 100 per project so the Milestones tab and S-Curve tab actually work,
 * instead of showing a flat 0% line.
 *
 * Root cause (confirmed via computeSCurve in lib/workflows/calculations.ts):
 * a milestone with weightPercent left at its schema default of 0 is silently
 * excluded from both the "planned" and "actual" curves — not a bug in the
 * calculation, just that zero milestones had ever been entered for these two
 * real jobs. This script is the fix: real milestones, derived from terms
 * already on file, not invented numbers.
 *
 * JKT — single PO EPC-L/2026-0450, Term of Payment "20% DP; 80% Cash Before
 * Delivery":
 *   DP 20%                  weight 20   due poDate            (2026-07-28)
 *   Cash Before Delivery 80% weight 80  due estimatedDeliveryDate (2026-08-14)
 *
 * BPN — two POs (2026/BPN-L-0505, 2026/BPN-L-0506) sharing one project and
 * one Term of Payment "40% DP, 50% Before Delivered, & 10% Retention":
 *   DP 40%                  weight 40   due poDate            (2026-07-20)
 *   Before Delivered 50%    weight 50   due estimatedDeliveryDate (2026-08-31)
 *   Retention 10%           weight 10   due estimatedDeliveryDate + 90 days
 *     (2026-11-29) — NOT on either PO; retention release dates are usually
 *     negotiated separately (e.g. "90 days after handover"). This due date
 *     is a placeholder so the milestone still counts toward the S-Curve —
 *     correct it via the Milestones tab once the real retention period with
 *     JPC is confirmed. Flagged in the milestone's own description field so
 *     it's visible in the UI, not just here.
 *
 * DP milestones are marked COMPLETED (with completedAt = poDate): the PO was
 * received and the DP invoice already issued for both jobs — that stage
 * genuinely happened, it isn't being assumed. Every other milestone stays
 * PENDING — actual physical progress (Before Delivered / final handover)
 * hasn't happened yet as of this backfill, and only a person confirming real
 * work status should flip that (via the Milestones tab's status dropdown),
 * not a script.
 *
 * Idempotent: matches existing milestones by (projectId, name) since there's
 * no DB-level unique constraint on that pair; skips a milestone that already
 * exists, never touches one manually edited since.
 *
 * Run:  npx tsx prisma/backfill-milestones.ts          (dry run)
 *       npx tsx prisma/backfill-milestones.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const D = (n: number) => new Prisma.Decimal(n);

type Spec = {
  job: "JKT" | "BPN";
  name: string;
  weightPercent: number;
  dueDate: string;
  status: "PENDING" | "COMPLETED";
  completedAt: string | null;
  description: string | null;
};

const SPECS: Spec[] = [
  {
    job: "JKT", name: "DP 20% - PO EPC-L/2026-0450", weightPercent: 20, dueDate: "2026-07-28",
    status: "COMPLETED", completedAt: "2026-07-28",
    description: "DP invoice sudah diterbitkan berdasarkan PO customer.",
  },
  {
    job: "JKT", name: "Cash Before Delivery 80% - PO EPC-L/2026-0450", weightPercent: 80, dueDate: "2026-08-14",
    status: "PENDING", completedAt: null,
    description: "Tanggal dari estimatedDeliveryDate PO (perkiraan AI dari \"Minggu ke 2 Agustus 2026\").",
  },
  {
    job: "BPN", name: "DP 40% - PO 2026/BPN-L-0505 & 0506", weightPercent: 40, dueDate: "2026-07-20",
    status: "COMPLETED", completedAt: "2026-07-20",
    description: "DP invoice sudah diterbitkan berdasarkan kedua PO customer.",
  },
  {
    job: "BPN", name: "Before Delivered 50% - PO 2026/BPN-L-0505 & 0506", weightPercent: 50, dueDate: "2026-08-31",
    status: "PENDING", completedAt: null,
    description: "Tanggal dari estimatedDeliveryDate PO (poDate + 6 minggu ARO).",
  },
  {
    job: "BPN", name: "Retention 10% - PO 2026/BPN-L-0505 & 0506", weightPercent: 10, dueDate: "2026-11-29",
    status: "PENDING", completedAt: null,
    description: "PERKIRAAN — tanggal retention TIDAK tercantum di PO asli, diisi 90 hari setelah estimasi kirim sebagai placeholder. Sesuaikan dengan kesepakatan retention period yang sebenarnya dengan JPC.",
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
  console.log(APPLY ? "MENERAPKAN pembuatan Milestone...\n" : "[SIMULASI — tidak ada yang ditulis]\n");
  await warmUp();

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, contractValue: true, customer: { select: { companyName: true } } },
  });
  const jkt = projects.find((p) => /jakarta prima/i.test(p.customer.companyName) && !/balikpapan/i.test(p.customer.companyName));
  const bpn = projects.find((p) => /balikpapan/i.test(p.customer.companyName));
  if (!jkt || !bpn) { console.error("Proyek JPC Jakarta / Balikpapan tidak ditemukan."); process.exit(1); }
  const proj = (k: "JKT" | "BPN") => (k === "JKT" ? jkt! : bpn!);

  for (const job of ["JKT", "BPN"] as const) {
    const weightSum = SPECS.filter((s) => s.job === job).reduce((s, x) => s + x.weightPercent, 0);
    if (weightSum !== 100) {
      console.error(`  [${job}] weightPercent tidak berjumlah 100 (${weightSum}) — periksa SPECS sebelum lanjut.`);
      process.exit(1);
    }
  }

  let sortOrder = 0;
  for (const s of SPECS) {
    const p = proj(s.job);
    const existing = await prisma.projectMilestone.findFirst({ where: { projectId: p.id, name: s.name } });

    if (existing) {
      console.log(`  SKIP [${s.job}] "${s.name}": sudah ada.`);
      sortOrder++;
      continue;
    }

    console.log(`  [${s.job}] CREATE  "${s.name}"  weight ${s.weightPercent}%  due ${s.dueDate}  status ${s.status}`);
    if (!APPLY) { sortOrder++; continue; }

    await prisma.projectMilestone.create({
      data: {
        projectId: p.id,
        name: s.name,
        dueDate: new Date(s.dueDate),
        status: s.status,
        progressPercent: s.status === "COMPLETED" ? 100 : 0,
        weightPercent: D(s.weightPercent),
        completedAt: s.completedAt ? new Date(s.completedAt) : null,
        description: s.description,
        sortOrder,
      },
    });
    sortOrder++;
  }

  console.log(APPLY ? "\nSelesai." : "\nSimulasi saja — jalankan ulang dengan --apply untuk menerapkan.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
