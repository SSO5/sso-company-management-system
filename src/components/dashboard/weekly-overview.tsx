import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { compareWeeklyItems } from "@/lib/weekly-comparison";
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
          number: true,
          items: {
            select: { id: true, sectionName: true, partName: true, quantity: true, notes: true, isDone: true },
            orderBy: { sortOrder: "asc" },
          },
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
          const previous = p.progressReports.find(
            (report) => latest && report.inspectionDate < latest.inspectionDate,
          );
          const changes = previous && latest
            ? compareWeeklyItems(previous.items, latest.items)
            : [];
          const changed = changes.filter((item) => ["changed", "new"].includes(item.kind)).length;
          const needsCheck = changes.filter((item) => ["missing", "ambiguous"].includes(item.kind)).length;
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
              <p className="mt-3 text-xs font-medium text-slate-700">
                {latest
                  ? previous
                    ? `${formatDate(previous.inspectionDate)} → ${formatDate(latest.inspectionDate)}`
                    : `Laporan awal ${formatDate(latest.inspectionDate)}`
                  : "Belum ada laporan progres"}
              </p>
              {latest && previous && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{changed} perubahan</span>
                  {needsCheck > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{needsCheck} perlu diperiksa</span>}
                </div>
              )}
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
