import { getFinanceReport } from "@/server/reports/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiLineChart } from "@/components/reports/charts";
import { formatCurrency } from "@/lib/utils";

export default async function FinanceReportPage() {
  const r = await getFinanceReport();
  const kpis = [
    { label: "Revenue (Invoiced)", value: formatCurrency(r.revenue) },
    { label: "Paid (Tunai)", value: formatCurrency(r.paid) },
    { label: "PPh 23 Dipotong", value: formatCurrency(r.withholdingTax) },
    { label: "Outstanding", value: formatCurrency(r.outstanding) },
    { label: "Overdue", value: formatCurrency(r.overdue) },
    { label: "Total Expenses", value: formatCurrency(r.totalExpenses) },
    { label: "Gross Profit", value: formatCurrency(r.grossProfit) },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold">Finance Report</h1></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}><CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader><CardContent><p className="text-base font-semibold">{k.value}</p></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>Revenue vs Expense by Month</CardTitle></CardHeader>
        <CardContent>
          <MultiLineChart data={r.monthly} lines={[{ key: "revenue", color: "#1e293b", label: "Revenue" }, { key: "expense", color: "#ef4444", label: "Expense" }]} />
        </CardContent>
      </Card>
    </div>
  );
}
