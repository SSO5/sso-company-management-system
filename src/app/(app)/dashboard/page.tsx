import { WeeklyOverview } from "@/components/dashboard/weekly-overview";
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
      value: new Set(items.filter(i => i.module === "project").map(i => i.href.split("?")[0])).size,
      detail: "Ada tindak lanjut atau keputusan",
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
      desc: "Perubahan progres, tindak lanjut, dan laporan",
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
      <WeeklyOverview />
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
