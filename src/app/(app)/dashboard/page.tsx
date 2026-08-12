import Link from "next/link";
import { getDashboardData } from "@/server/dashboard";
import { getMyActionItems } from "@/server/action-items";
import { getJobChecklists } from "@/server/document-checklist";
import { requireUser } from "@/lib/auth/current-user";
import { ActionItemsPanel } from "@/components/dashboard/action-items-panel";
import { DocumentChecklistPanel } from "@/components/dashboard/document-checklist-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const [{ kpis, alerts }, myActionItems, jobChecklists, actor] = await Promise.all([
    getDashboardData(),
    getMyActionItems(),
    getJobChecklists(),
    requireUser(),
  ]);
  // VIEWER is an oversight role: seeing what is outstanding is precisely its
  // purpose, but it may not upload. Showing an upload button it cannot use
  // would be a dead end, so the panel renders read-only for that role.
  const canUpload = actor.role !== "VIEWER";

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
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    /**
     * Order is the whole point of this page. It used to open with six KPI
     * cards — numbers that tell a director how the company is doing, but tell
     * a sales engineer nothing about what to do next. Someone who was not
     * part of building this app landed here and had to work out, unaided,
     * which of eight menus held their next task.
     *
     * So the answer comes first: what is waiting on YOU, scoped to your role
     * (see getMyActionItems). The company-level numbers stay, one scroll down,
     * for the people who came for them.
     */
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tugas Saya</h1>
        <p className="text-sm text-muted-foreground">
          Yang menunggu tindakan Anda hari ini. Daftar ini dihitung langsung dari data — tidak perlu diperbarui manual.
        </p>
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
              {/* data-tabular: currency and counts line up across the row —
                  see the tabular-nums rule in globals.css. */}
              <p data-tabular className="mt-1.5 text-lg font-semibold tracking-tight">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
  );
}
