/**
 * Turns findings from the Gmail archive into real work items inside the app.
 *
 * A PDF timeline tells someone what happened. A task with an owner and a due
 * date is what actually makes the invoice get paid. These are the three things
 * that were stuck on SSO's side as of 12 Aug 2026 — every one of them had the
 * customer already waiting on us, not the other way round.
 *
 * Idempotent: a task with the same title on the same project is never created
 * twice, so this is safe to re-run after adding new findings.
 *
 * Known gap, stated rather than hidden: ProjectTask requires a projectId, so
 * the NCS follow-up (an Opportunity, not yet a Project) cannot become a task.
 * It is raised as a notification instead. If pre-Won work needs tracked tasks,
 * ProjectTask needs an optional opportunityId — a schema change, not a script.
 */
import { PrismaClient, TaskPriority } from "@prisma/client";
import { notifyAndSend } from "../src/lib/notifications/notify-and-send";

const prisma = new PrismaClient();

interface Followup {
  /** Matched against Project.number, Project.name and the customer name. */
  projectHint: string[];
  title: string;
  description: string;
  assigneeEmail: string;
  dueDate: string;
  priority: TaskPriority;
}

const FOLLOWUPS: Followup[] = [
  {
    projectHint: ["jakarta prima cranes", "pusri", "dodge"],
    title: "Lengkapi materai Invoice DP dan kirim ulang ke JPC",
    description:
      "Invoice DP 001/INV/FIN/VIII/2026 (Rp 71.040.000) tertahan sejak 5 Agustus 2026. " +
      "Bu Marena (payable@jpc.co.id) sudah menerima revisi DPP 20% / DPP Nilai Lain / faktur pajak, " +
      "tetapi membalas: \"Masih kurang materai bu, mohon dilengkapi.\" Tidak ada korespondensi lanjutan sejak itu. " +
      "Lengkapi materai + stempel + tanda tangan, kirim ulang ke payable@jpc.co.id dengan cc suci.rahmawati@jpc.co.id. " +
      "Jatuh tempo invoice: 19 Agustus 2026.",
    assigneeEmail: "saranasinergi.optima@gmail.com",
    dueDate: "2026-08-14",
    priority: "CRITICAL",
  },
  {
    projectHint: ["jakarta prima cranes", "pusri", "dodge"],
    title: "Kirim hardcopy asli Invoice DP setelah dikonfirmasi JPC",
    description:
      "Sudah dijanjikan ke JPC pada email 5 Agustus 2026: hardcopy asli menyusul setelah invoice terkonfirmasi. " +
      "Janji ini belum ditepati karena invoice masih tertahan di materai.",
    assigneeEmail: "saranasinergi.optima@gmail.com",
    dueDate: "2026-08-19",
    priority: "HIGH",
  },
  {
    projectHint: ["balikpapan", "bpn", "mifa"],
    title: "Konfirmasi status pembayaran Invoice ke JPC Balikpapan",
    description:
      "Invoice 001/INV/FIN/V/2026 (Rp 49.030.000) jatuh tempo 17 Agustus 2026. " +
      "Invoice DP dikirim ke Pak Sendy pada 24 Juli 2026 dan sejak itu TIDAK ADA korespondensi email sama sekali — " +
      "tidak ada konfirmasi penerimaan maupun konfirmasi pembayaran. " +
      "Hubungi admin5_pr@jpcbpn.co.id untuk memastikan status sebelum jatuh tempo.",
    assigneeEmail: "saranasinergi.optima@gmail.com",
    dueDate: "2026-08-14",
    priority: "CRITICAL",
  },
  {
    projectHint: ["balikpapan", "bpn", "mifa"],
    title: "Tindak lanjuti persetujuan Additional Work Motor 45kW + Gearbox 45kW",
    description:
      "Pekerjaan tambahan masih menunggu tanda tangan manajemen JPC per 10 Agustus 2026. " +
      "Quotation 006/QUO/MKT/VII/2026 R2 sudah dikirim namun nilainya belum tercatat di aplikasi. " +
      "Catatan: Gearbox 55 kW adalah jalur komersial terpisah, on-hold, belum ada penawaran — jangan digabung.",
    assigneeEmail: "aldoakbar44@gmail.com",
    dueDate: "2026-08-18",
    priority: "HIGH",
  },
];

// Not attachable to a Project — raised to the team as notifications instead.
const OPPORTUNITY_ALERTS = [
  {
    title: "Costing NCS belum dibuat — data vendor sudah ada",
    message:
      "Penawaran vendor bracket roller dari Rinaldi Erlangga diterima 5 Agustus 2026 dan masih di email, " +
      "belum masuk folder maupun aplikasi. Quotation NCS Rp 366.000.000 berjalan tanpa costing sheet — " +
      "margin pekerjaan ini belum diketahui.",
    link: "/sales/opportunities",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, name: true, customer: { select: { companyName: true } } },
    }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true, role: true } }),
  ]);

  const admin = users.find((u) => u.role === "ADMIN");
  if (!admin) { console.error("No active ADMIN to attribute these tasks to."); process.exit(1); }

  function findUser(email: string) {
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }
  function findProject(hints: string[]) {
    return projects.find((p) => {
      const hay = `${p.number} ${p.name} ${p.customer.companyName}`.toLowerCase();
      // Every hint must appear somewhere, so "balikpapan" cannot match the
      // Jakarta project just because both mention Jakarta Prima Cranes.
      return hints.some((h) => hay.includes(h.toLowerCase()));
    });
  }

  console.log(apply ? "Applying operational follow-ups...\n" : "[DRY RUN — nothing will be written]\n");

  let created = 0, skipped = 0;
  for (const f of FOLLOWUPS) {
    const project = findProject(f.projectHint);
    if (!project) { console.log(`  SKIP  "${f.title}" — no project matching ${f.projectHint.join("/")}`); skipped++; continue; }

    const assignee = findUser(f.assigneeEmail);
    const exists = await prisma.projectTask.findFirst({
      where: { projectId: project.id, title: f.title, deletedAt: null },
    });
    if (exists) { console.log(`  HAVE  "${f.title}" — already on ${project.number}`); skipped++; continue; }

    console.log(`  ${apply ? "ADD " : "WOULD ADD"}  [${f.priority}] "${f.title}"`);
    console.log(`         -> ${project.number} · ${project.customer.companyName} · ${assignee?.name ?? "belum ditugaskan"} · jatuh tempo ${f.dueDate}`);

    if (apply) {
      await prisma.projectTask.create({
        data: {
          projectId: project.id,
          title: f.title,
          description: f.description,
          assignedToId: assignee?.id ?? null,
          dueDate: new Date(f.dueDate),
          priority: f.priority,
          status: "TODO",
          createdById: admin.id,
        },
      });
      if (assignee) {
        // notifyAndSend, not notification.create: the person who owns this
        // task is exactly the person who should hear about it on WhatsApp,
        // not only when they next happen to open the app.
        await notifyAndSend(
          { userId: assignee.id },
          {
            type: "PROJECT_DEADLINE",
            title: f.title,
            message: `${project.number} — jatuh tempo ${f.dueDate}. Dibuat dari hasil telaah arsip email.`,
            link: `/projects/${project.id}`,
          }
        );
      }
      created++;
    }
  }

  console.log("");
  for (const a of OPPORTUNITY_ALERTS) {
    console.log(`  ${apply ? "NOTIFY" : "WOULD NOTIFY"}  ${a.title}`);
    if (apply) {
      const admins = users.filter((u) => u.role === "ADMIN" || u.role === "SALES").map((u) => u.id);
      await notifyAndSend({ userIds: admins }, { type: "PROJECT_CLOSING_INCOMPLETE", title: a.title, message: a.message, link: a.link });
    }
  }

  console.log(apply ? `\nDone. ${created} task(s) created, ${skipped} skipped.` : "\nDry run only — re-run with --apply.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
