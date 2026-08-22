import Link from "next/link";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/server/dashboard";
import { getMyActionItems } from "@/server/action-items";
import { getJobChecklists } from "@/server/document-checklist";
import { getMyNotifications } from "@/server/notifications";
import { getThemeSettings } from "@/server/settings/theme";
import { requireUser } from "@/lib/auth/current-user";
import { ProfileHub } from "@/components/dashboard/profile-hub";
import { ActionItemsPanel } from "@/components/dashboard/action-items-panel";
import { DocumentChecklistPanel } from "@/components/dashboard/document-checklist-panel";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { BillingScheduleCard } from "@/components/finance/billing-schedule-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ShieldCheck, Clock, AlertCircle } from "lucide-react";

const PIPELINE_STAGE_LABEL: Record<string, string> = {
  NEW: "Baru", QUALIFIED: "Qualified", PROPOSAL: "Proposal", NEGOTIATION: "Negosiasi",
};

export default async function DashboardPage() {
  const [
    { kpis, alerts, billingSchedule, projectProgress, salesPipeline },
    myActionItems, jobChecklists, notifications, actor, theme,
  ] = await Promise.all([
    getDashboardData(),
    getMyActionItems(),
    getJobChecklists(),
    getMyNotifications(),
    requireUser(),
    getThemeSettings(),
  ]);

  const [profile, myActiveProjectCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { avatarUrl: true, title: true, whatsappNumber: true, createdAt: true },
    }),
    prisma.project.count({ where: { deletedAt: null, status: "ACTIVE", projectManagerId: actor.userId } }),
  ]);

  // VIEWER is an oversight role: seeing what is outstanding is precisely its
  // purpose, but it may not upload. Showing an upload button it cannot use
  // would be a dead end, so the panel renders read-only for that role.
  const canUpload = actor.role !== "VIEWER";

  // A PM's own active-project count is more useful to a PM than the
  // company-wide figure; everyone else (Admin, Sales, Finance) sees the
  // company-wide "Active Projects" kpi instead, since they don't "handle"
  // a personal subset of projects the same way.
  const isPM = actor.role === "PROJECT_MANAGER";
  const ringkasan = {
    pendingApproval: myActionItems.filter((i) => i.severity === "pending_approval").length,
    dueSoon: myActionItems.filter((i) => i.severity === "due_soon").length,
    overdue: myActionItems.filter((i) => i.severity === "overdue").length,
  };

  const kpiCards = [
    { label: "Total Revenue", value: formatCurrency(kpis.totalRevenue) },
    { label: "Outstanding Receivables", value: formatCurrency(kpis.outstandingReceivables) },
    { label: "Active Projects", value: String(kpis.activeProjects) },
    { label: "Projects At Risk", value: String(kpis.atRiskProjects) },
    { label: "Completed Projects", value: String(kpis.completedProjects) },
    { label: "Gross Profit", value: formatCurrency(kpis.grossProfit) },
  ];

  const alertItems = [
    alerts.overdueInvoices.length > 0 && {
      text: `${alerts.overdueInvoices.length} invoice(s) overdue`,
      href: "/finance/receivables",
    },
    alerts.projectsAtRiskCount > 0 && {
      text: `${alerts.projectsAtRiskCount} project(s) at risk`,
      href: "/projects",
    },
    alerts.quotationsAwaitingApproval.length > 0 && {
      text: `${alerts.quotationsAwaitingApproval.length} quotation(s) waiting approval`,
      href: "/sales/quotations",
    },
    alerts.expiringContracts.length > 0 && {
      text: `${alerts.expiringContracts.length} contract(s) expiring within 30 days`,
      href: "/sales/contracts",
    },
    alerts.billingDueSoon.length > 0 && {
      text: `${alerts.billingDueSoon.length} project punya tahap penagihan jatuh tempo minggu ini`,
      href: "/finance/receivables",
    },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="space-y-4">
      <ProfileHub
        name={actor.name}
        role={actor.role}
        title={profile.title}
        email={actor.email}
        whatsappNumber={profile.whatsappNumber}
        avatarUrl={profile.avatarUrl}
        createdAt={profile.createdAt}
        taskCount={myActionItems.length}
        projectCount={isPM ? myActiveProjectCount : kpis.activeProjects}
        projectCountLabel={isPM ? "Project Aktif Saya" : "Project Aktif (Perusahaan)"}
        unreadNotifications={notifications.unreadCount}
        backgroundUrl={theme.dashboardBackgroundUrl}
        canUpload={canUpload}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">

          {/* Ringkasan — same severities ActionItemsPanel below lists one by
              one, rolled up into three counts so "how much is waiting" reads
              in one glance before the detail. */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-primary/15 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-primary"><span className="text-xs font-semibold">Menunggu Approval</span><ShieldCheck className="h-3.5 w-3.5 opacity-60" /></div>
                <p data-tabular className="mt-2 text-2xl font-bold text-primary">{ringkasan.pendingApproval}</p>
              </CardContent>
            </Card>
            <Card className="border-warning/25 bg-warning/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-warning"><span className="text-xs font-semibold">Segera Jatuh Tempo</span><Clock className="h-3.5 w-3.5 opacity-60" /></div>
                <p data-tabular className="mt-2 text-2xl font-bold text-warning">{ringkasan.dueSoon}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-destructive"><span className="text-xs font-semibold">Terlambat</span><AlertCircle className="h-3.5 w-3.5 opacity-60" /></div>
                <p data-tabular className="mt-2 text-2xl font-bold text-destructive">{ringkasan.overdue}</p>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Prospek & Keuangan Perusahaan */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Pipeline Prospek</CardTitle>
                <Link href="/sales/opportunities" className="text-xs text-primary hover:underline">Semua Prospek &rarr;</Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {salesPipeline.stages.map((s) => (
                    <div key={s.status} className="text-center">
                      <div className="flex h-9 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">{s.count}</div>
                      <p className="mt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">{PIPELINE_STAGE_LABEL[s.status]}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <div><p className="text-[10.5px] text-muted-foreground">Nilai Pipeline</p><p data-tabular className="font-semibold">{formatCurrency(salesPipeline.totalValue)}</p></div>
                  {salesPipeline.winRate != null && (
                    <div className="text-right"><p className="text-[10.5px] text-muted-foreground">Win Rate</p><p data-tabular className="font-semibold text-success">{salesPipeline.winRate}%</p></div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Keuangan Perusahaan</CardTitle>
                <Link href="/reports/finance" className="text-xs text-primary hover:underline">Laporan &rarr;</Link>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Revenue</span><span data-tabular className="font-semibold">{formatCurrency(kpis.totalRevenue)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Piutang Belum Tertagih</span><span data-tabular className="font-semibold text-warning">{formatCurrency(kpis.outstandingReceivables)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Profit</span><span data-tabular className="font-semibold text-success">{formatCurrency(kpis.grossProfit)}</span></div>
              </CardContent>
            </Card>
          </div>

          <ActionItemsPanel items={myActionItems} />

          <DocumentChecklistPanel jobs={jobChecklists} canUpload={canUpload} />

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">Ringkasan Perusahaan</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {kpiCards.map((k) => (
              <Card key={k.label} className="transition-shadow hover:shadow-[0_2px_4px_0_rgb(16_24_40/0.06),0_4px_10px_-2px_rgb(16_24_40/0.08)]">
                <CardContent className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p data-tabular className="mt-1.5 text-lg font-semibold tracking-tight">{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {projectProgress.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Progres Project Aktif</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {projectProgress.map((p) => {
                  const GapIcon = p.scheduleGap > 1 ? TrendingUp : p.scheduleGap < -1 ? TrendingDown : Minus;
                  const gapColor = p.scheduleGap > 1 ? "text-success" : p.scheduleGap < -1 ? "text-destructive" : "text-muted-foreground";
                  return (
                    <Link
                      key={p.projectId}
                      href={`/projects/${p.projectId}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.customerName}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.projectNumber}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-xs">
                        <span className="text-muted-foreground">Rencana <span data-tabular className="font-medium text-foreground">{p.planned}%</span></span>
                        <span className="text-muted-foreground">Realisasi <span data-tabular className="font-medium text-foreground">{p.actual}%</span></span>
                        <span className="text-muted-foreground">Ditagih <span data-tabular className="font-medium text-foreground">{p.billed}%</span></span>
                        <span className={cn("flex items-center gap-1 font-medium", gapColor)}>
                          <GapIcon className="h-3.5 w-3.5" />
                          {p.scheduleGap > 0 ? "+" : ""}{p.scheduleGap}%
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <BillingScheduleCard rows={billingSchedule} compact title="Jadwal Penagihan Berikutnya" />

          {alertItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alertItems.map((a) => (
                  <Link
                    key={a.text}
                    href={a.href}
                    className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm hover:bg-warning/20"
                  >
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    {a.text}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {alerts.overdueInvoices.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Overdue Invoices</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {alerts.overdueInvoices.map((inv) => (
                  <Link key={inv.id} href={`/finance/invoices/${inv.id}`} className="flex justify-between text-sm hover:underline">
                    <span>{inv.number} — {inv.customer.companyName}</span>
                    <span className="text-muted-foreground">Due {formatDate(inv.dueDate)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:h-fit">
          <NotificationsPanel items={notifications.items} unreadCount={notifications.unreadCount} />
        </aside>
      </div>
    </div>
  );
}
