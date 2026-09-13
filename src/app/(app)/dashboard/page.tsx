import Link from "next/link";
import { getDashboardData } from "@/server/dashboard";
import { getMyActionItems } from "@/server/action-items";
import { requireUser } from "@/lib/auth/current-user";
import { ActionItemsPanel } from "@/components/dashboard/action-items-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/workspace";
import { ArrowUpRight, FolderKanban, Database, ListChecks } from "lucide-react";

export default async function DashboardPage() {
  const [actor, data, items] = await Promise.all([
    requireUser(),
    getDashboardData(),
    getMyActionItems(),
  ]);
  const { kpis, projectProgress, salesPipeline } = data;
  const finance = ["ADMIN", "FINANCE", "VIEWER"].includes(actor.role),
    sales = ["ADMIN", "SALES", "VIEWER"].includes(actor.role);
  const stats = [
    {
      label: "Tindakan terlambat",
      value: items.filter((i) => i.severity === "overdue").length,
      detail: "Prioritas penyelesaian",
      href: "/work?filter=overdue",
    },
    {
      label: "Persetujuan menunggu",
      value: items.filter((i) => i.severity === "pending_approval").length,
      detail: "Sesuai kewenangan Anda",
      href: "/work?filter=pending_approval",
    },
    {
      label: "Proyek aktif",
      value: kpis.activeProjects,
      detail: "Aktif dan perlu perhatian",
      href: "/projects",
    },
    {
      label: "Proyek perlu perhatian",
      value: kpis.atRiskProjects,
      detail: "Risiko jadwal, biaya, atau status",
      href: "/projects",
    },
  ];
  const rooms = [
    {
      href: "/work",
      title: "Tindak lanjut",
      desc: "Persetujuan dan pekerjaan jatuh tempo",
      Icon: ListChecks,
    },
    {
      href: "/projects",
      title: "Ruang proyek",
      desc: "Tahapan, biaya, laporan, dan dokumen",
      Icon: FolderKanban,
    },
    {
      href: "/data",
      title: "Data & Dokumen",
      desc: "Dokumen asli dan catatan aplikasi",
      Icon: Database,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">
            {ROLE_LABELS[actor.role]} ·{" "}
            {new Intl.DateTimeFormat("id-ID", {
              dateStyle: "full",
              timeZone: "Asia/Jakarta",
            }).format(new Date())}
          </p>
          <h1>Selamat bekerja, {actor.name.split(" ")[0]}.</h1>
          <p className="workspace-muted mt-2">
            {actor.role === "VIEWER"
              ? "Pantau penyimpangan dan keputusan yang memerlukan perhatian."
              : "Mulai dari yang paling penting. Lanjutkan pekerjaan di ruang yang tepat."}
          </p>
        </div>
        <Link
          href="/data"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-white"
        >
          <Database size={16} /> Data & Dokumen <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="workspace-stat hover:bg-slate-50"
          >
            <span className="text-sm text-slate-600">{s.label}</span>
            <strong>{s.value}</strong>
            <small>{s.detail}</small>
          </Link>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <ActionItemsPanel
          items={items}
          limit={6}
          title={actor.role === "ADMIN" ? "Prioritas tim" : "Prioritas Anda"}
        />
        <Card>
          <CardHeader>
            <CardTitle>Ruang kerja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rooms.map(({ href, title, desc, Icon }) => (
              <Link key={href} href={href} className="workspace-action">
                <Icon size={20} className="shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {desc}
                  </p>
                </div>
                <ArrowUpRight size={16} className="ml-auto shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Kondisi proyek</CardTitle>
          <Link href="/projects" className="text-sm text-primary">
            Buka semua proyek →
          </Link>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">
            Realisasi mengikuti bobot milestone selesai, bukan persentase
            checklist laporan. Selisih dalam poin persentase.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {projectProgress.length === 0 ? (
              <p className="workspace-muted">Belum ada proyek aktif.</p>
            ) : (
              projectProgress.map((p) => (
                <Link
                  key={p.projectId}
                  href={`/projects/${p.projectId}?tab=milestones`}
                  className="rounded-2xl border p-4 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">
                        {p.customerName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.projectNumber}
                      </p>
                    </div>
                    <span
                      className={`workspace-pill ${p.atRisk ? "!bg-amber-50 !text-amber-800" : "!bg-emerald-50 !text-emerald-800"}`}
                    >
                      {p.atRisk ? "Perlu perhatian" : !p.hasPlan ? "Rencana belum tersedia" : "Sesuai rencana"}
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.max(0, Math.min(100, p.actual))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="text-muted-foreground">
                      Rencana{" "}
                      <b className="mt-1 block text-foreground">{p.planned}%</b>
                    </div>
                    <div className="text-muted-foreground">
                      Realisasi{" "}
                      <b className="mt-1 block text-foreground">{p.actual}%</b>
                    </div>
                    <div className="text-muted-foreground">
                      Selisih{" "}
                      <b className="mt-1 block text-foreground">
                        {p.scheduleGap > 0 ? "+" : ""}
                        {p.scheduleGap} poin
                      </b>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {sales && (
          <Card>
            <CardHeader>
              <CardTitle>Prospek menuju pesanan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {salesPipeline.stages.map((s) => (
                  <Link
                    href="/sales/opportunities"
                    key={s.status}
                    className="rounded-xl bg-slate-50 p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {
                        {
                          NEW: "Baru",
                          QUALIFIED: "Terkualifikasi",
                          PROPOSAL: "Penawaran",
                          NEGOTIATION: "Negosiasi",
                        }[s.status]
                      }
                    </p>
                    <p className="mt-2 text-xl font-semibold">{s.count}</p>
                  </Link>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Estimasi nilai prospek:{" "}
                <b className="text-foreground">
                  {formatCurrency(salesPipeline.totalValue)}
                </b>
              </p>
            </CardContent>
          </Card>
        )}
        {finance && (
          <Card>
            <CardHeader>
              <CardTitle>Penagihan perusahaan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Invoice diterbitkan
                </span>
                <b>{formatCurrency(kpis.totalRevenue)}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Piutang belum diselesaikan
                </span>
                <b>{formatCurrency(kpis.outstandingReceivables)}</b>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Akumulasi seluruh periode. Draf dan pengajuan belum dihitung
                sebagai penagihan. Nilai invoice bukan pengakuan pendapatan
                akuntansi.
              </p>
              <Link
                href="/finance/receivables"
                className="inline-block py-2 text-sm text-primary"
              >
                Tinjau piutang dan jadwal penagihan →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
