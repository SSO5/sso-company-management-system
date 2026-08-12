import Link from "next/link";
import { getDashboardData } from "@/server/dashboard";
import { getMyActionItems } from "@/server/action-items";
import { ActionItemsPanel } from "@/components/dashboard/action-items-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const [{ kpis, alerts }, myActionItems] = await Promise.all([getDashboardData(), getMyActionItems()]);

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

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">Ringkasan Perusahaan</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{k.value}</p>
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
