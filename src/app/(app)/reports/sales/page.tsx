import { getSalesReport } from "@/server/reports/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleBarChart, MultiLineChart } from "@/components/reports/charts";
import { formatCurrency } from "@/lib/utils";

export default async function SalesReportPage() {
  const r = await getSalesReport();
  const kpis = [
    { label: "Total Opportunities", value: r.totalOpportunities },
    { label: "Total Quotation Value", value: formatCurrency(r.totalQuotationValue) },
    { label: "Won Value", value: formatCurrency(r.wonValue) },
    { label: "Lost Value", value: formatCurrency(r.lostValue) },
    { label: "Win Rate", value: `${r.winRate}%` },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold">Sales Report</h1></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}><CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader><CardContent><p className="text-base font-semibold">{k.value}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Monthly Sales (Quotation Value)</CardTitle></CardHeader><CardContent><MultiLineChart data={r.monthlySales} lines={[{ key: "value", color: "#1e293b", label: "Quotation Value" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Revenue by Sales PIC (Won)</CardTitle></CardHeader><CardContent><SimpleBarChart data={r.revenueBySalesPic} dataKey="value" /></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Top 10 Customers by Revenue (Won)</CardTitle></CardHeader><CardContent><SimpleBarChart data={r.revenueByCustomer} dataKey="value" height={300} /></CardContent></Card>
      </div>
    </div>
  );
}
