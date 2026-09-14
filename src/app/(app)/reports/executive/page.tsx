import { getExecutiveReport } from "@/server/reports/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiLineChart, SimplePieChart } from "@/components/reports/charts";
import { formatCurrency } from "@/lib/utils";

export default async function ExecutiveReportPage() {
  const { sales, finance, project } = await getExecutiveReport();

  const kpis = [
    { label: "Tagihan diterbitkan", value: formatCurrency(finance.revenue) },
    { label: "Outstanding Receivables", value: formatCurrency(finance.outstanding) },
    { label: "Active Projects", value: project.active },
    { label: "Projects At Risk", value: project.atRisk },
    { label: "Completed Projects", value: project.completed },
    { label: "Laba aktual", value: "Belum tersedia" },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold">Executive Report</h1><p className="text-sm text-muted-foreground">Company-wide performance across Sales, Finance, and Project execution.</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}><CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader><CardContent><p className="text-base font-semibold">{k.value}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Tagihan dan biaya tercatat (bukan laba)</CardTitle></CardHeader><CardContent><MultiLineChart data={finance.monthly} lines={[{ key: "revenue", color: "#1e293b", label: "Tagihan" }, { key: "expense", color: "#ef4444", label: "Expense" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Project Status</CardTitle></CardHeader><CardContent><SimplePieChart data={project.statusBreakdown} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Sales Pipeline (Quotation Value / Month)</CardTitle></CardHeader><CardContent><MultiLineChart data={sales.monthlySales} lines={[{ key: "value", color: "#3b82f6", label: "Quotation Value" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Win Rate</CardTitle></CardHeader><CardContent className="flex h-[260px] items-center justify-center"><p className="text-4xl font-semibold">{sales.winRate}%</p></CardContent></Card>
      </div>
    </div>
  );
}
