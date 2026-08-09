import { getProjectReport } from "@/server/reports/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimplePieChart } from "@/components/reports/charts";

export default async function ProjectReportPage() {
  const r = await getProjectReport();
  const kpis = [
    { label: "Total Projects", value: r.total },
    { label: "Active", value: r.active },
    { label: "Completed", value: r.completed },
    { label: "At Risk", value: r.atRisk },
    { label: "Delayed", value: r.delayed },
    { label: "Avg Progress", value: `${r.avgProgress}%` },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold">Project Report</h1></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}><CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader><CardContent><p className="text-base font-semibold">{k.value}</p></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>Project Status Breakdown</CardTitle></CardHeader><CardContent><SimplePieChart data={r.statusBreakdown} /></CardContent></Card>
    </div>
  );
}
