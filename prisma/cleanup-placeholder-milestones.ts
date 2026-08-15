/**
 * Deletes the generic "Milestone 1 — Planning" ... "Milestone 5 — Closing"
 * placeholder rows that convertQuotationToProject() used to auto-create on
 * every single Won deal (removed Aug 2026 — see lib/workflows/project.ts).
 * They carried weightPercent 0 and no dueDate, so they never counted toward
 * the S-Curve, but they still cluttered the Milestones tab next to the real,
 * PO-derived milestones (see backfill-milestones.ts) — exactly what the
 * founder flagged as noise.
 *
 * Only deletes rows that are STILL untouched: name matches the exact
 * template text, weightPercent = 0, dueDate = null, status = PENDING. Before
 * this script's companion change (MilestonePanel edit action), there was no
 * way to edit a milestone at all — only create and change status — so any
 * row matching all four conditions is guaranteed to be an unedited
 * placeholder, never a real milestone a PM happened to leave at 0%.
 *
 * Hard delete (ProjectMilestone has no soft-delete column). Cannot be
 * undone — but these are, by construction, empty placeholders.
 *
 * Run:  npx tsx prisma/cleanup-placeholder-milestones.ts          (dry run)
 *       npx tsx prisma/cleanup-placeholder-milestones.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const PLACEHOLDER_NAMES = [
  "Milestone 1 — Planning",
  "Milestone 2 — Development",
  "Milestone 3 — Delivery",
  "Milestone 4 — Acceptance",
  "Milestone 5 — Closing",
];

async function main() {
  console.log(APPLY ? "MENGHAPUS milestone placeholder...\n" : "[SIMULASI — tidak ada yang dihapus]\n");

  const candidates = await prisma.projectMilestone.findMany({
    where: {
      name: { in: PLACEHOLDER_NAMES },
      weightPercent: 0,
      dueDate: null,
      status: "PENDING",
    },
    include: { project: { select: { number: true, name: true } } },
  });

  if (candidates.length === 0) {
    console.log("Tidak ada milestone placeholder yang cocok — sudah bersih, atau sudah pernah diedit/dihapus manual.");
    return;
  }

  const byProject = new Map<string, typeof candidates>();
  for (const m of candidates) {
    const key = `${m.project.number} — ${m.project.name}`;
    byProject.set(key, [...(byProject.get(key) ?? []), m]);
  }
  for (const [project, rows] of byProject) {
    console.log(`  [${project}] ${rows.length} placeholder: ${rows.map((r) => r.name).join(", ")}`);
  }
  console.log(`\nTotal: ${candidates.length} milestone di ${byProject.size} project.`);

  if (!APPLY) {
    console.log("\nSimulasi saja — jalankan ulang dengan --apply untuk menghapus.\n");
    return;
  }

  await prisma.projectMilestone.deleteMany({
    where: { id: { in: candidates.map((c) => c.id) } },
  });

  console.log(`\nSelesai — ${candidates.length} milestone placeholder dihapus.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
