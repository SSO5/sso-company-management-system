import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
export async function WeeklyOverview() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      name: true,
      customer: { select: { companyName: true } },
      progressReports: {
        where: { deletedAt: null },
        orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
        take: 3,
        select: {
          id: true,
          inspectionDate: true,
          summary: true,
          dateVerified: true,
        },
      },
      _count: {
        select: {
          tasks: {
            where: {
              deletedAt: null,
              assignedToId: { not: null },
              status: { not: "COMPLETED" },
            },
          },
        },
      },
    },
  });
  return (
    <section className="rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Progres tiap kontrak</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Berdasarkan laporan terakhir, dengan tanggal dan sumber yang dapat
            diperiksa.
          </p>
        </div>
        <Link className="py-3 text-sm text-primary" href="/projects">
          Semua proyek →
        </Link>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {projects.map((p) => {
          const latest = p.progressReports[0];
          const ambiguous =
            latest &&
            p.progressReports.filter(
              (r) =>
                r.inspectionDate.toISOString().slice(0, 10) ===
                latest.inspectionDate.toISOString().slice(0, 10),
            ).length > 1;
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}?tab=progress`}
              className="rounded-xl border p-4 transition-colors hover:bg-slate-50"
            >
              <p className="text-xs font-medium text-primary">
                {p.number} · {p.customer.companyName}
              </p>
              <h3 className="mt-2 text-sm font-semibold">{p.name}</h3>
              <p className="mt-3 text-xs text-muted-foreground">
                {latest
                  ? `Laporan ${formatDate(latest.inspectionDate)}${latest.dateVerified ? "" : " · tanggal perlu diperiksa"}`
                  : "Belum ada laporan progres"}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed">
                {ambiguous
                  ? "Ada beberapa versi pada tanggal terakhir. Pilih sumber yang benar sebelum menyimpulkan progres."
                  : latest?.summary ||
                    "Unggah laporan vendor untuk mulai memantau pekerjaan."}
              </p>
              <p className="mt-3 text-xs text-primary">
                {p._count.tasks} tindak lanjut belum selesai · Buka pantauan →
              </p>
            </Link>
          );
        })}
      </div>
      {!projects.length && (
        <p className="mt-5 text-sm text-muted-foreground">
          Belum ada proyek aktif untuk dipantau.
        </p>
      )}
    </section>
  );
}
