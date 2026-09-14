import { getSalesReport } from "@/server/reports/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleBarChart, MultiLineChart } from "@/components/reports/charts";
import { formatCurrency } from "@/lib/utils";

export default async function SalesReportPage() {
  const r = await getSalesReport();
  const kpis = [
    { label: "Total prospek", value: r.totalOpportunities },
    { label: "Nilai seluruh penawaran", value: formatCurrency(r.totalQuotationValue) },
    { label: "Nilai dimenangkan", value: formatCurrency(r.wonValue) },
    { label: "Nilai tidak berlanjut", value: formatCurrency(r.lostValue) },
    { label: "Tingkat kemenangan", value: `${r.winRate}%` },
  ];

  return (
    <div className="space-y-6">
      <div><p className="workspace-eyebrow">Kinerja komersial</p><h1 className="text-xl font-semibold">Laporan penjualan</h1></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}><CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader><CardContent><p className="text-base font-semibold">{k.value}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Nilai penawaran per bulan</CardTitle></CardHeader><CardContent><MultiLineChart data={r.monthlySales} lines={[{ key: "value", color: "#1e293b", label: "Nilai penawaran" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Nilai dimenangkan per PIC</CardTitle></CardHeader><CardContent><SimpleBarChart data={r.revenueBySalesPic} dataKey="value" /></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>10 pelanggan dengan nilai kemenangan terbesar</CardTitle></CardHeader><CardContent><SimpleBarChart data={r.revenueByCustomer} dataKey="value" height={300} /></CardContent></Card>
      </div>
    </div>
  );
}
