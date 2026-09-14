import Link from "next/link";
import { getProjectReport } from "@/server/reports/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimplePieChart, GroupedBarChart } from "@/components/reports/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { TriangleAlert } from "lucide-react";

export default async function ProjectReportPage() {
  const r = await getProjectReport();
  const kpis = [
    { label: "Total proyek", value: r.total },
    { label: "Aktif", value: r.active },
    { label: "Selesai", value: r.completed },
    { label: "Butuh Perhatian", value: r.signalsDetected, warn: r.signalsDetected > 0 },
    { label: "Lewat target akhir", value: r.delayed },
    { label: "Rata-rata progres", value: `${r.avgProgress}%` },
    { label: "Rata-rata deviasi jadwal", value: `${r.avgScheduleDeviation}%`, warn: r.avgScheduleDeviation > 15 },
  ];

  return (
    <div className="space-y-6">
      <div><p className="workspace-eyebrow">Kondisi seluruh kontrak</p><h1 className="text-xl font-semibold">Laporan proyek</h1></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1"><CardTitle className="text-[11px] font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader>
            <CardContent><p className={`text-base font-semibold ${k.warn ? "text-destructive" : ""}`}>{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5"><TriangleAlert className="h-4 w-4 text-destructive" /> Proyek yang perlu perhatian</CardTitle></CardHeader>
        <CardContent>
          {r.riskyProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada proyek aktif dengan sinyal risiko saat ini.</p>
          ) : (
            <div className="space-y-2">
              {r.riskyProjects.map((p) => (
                <div key={p.number} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Link href={`/projects`} className="font-mono text-xs hover:underline">{p.number}</Link>
                    <span className="text-xs text-muted-foreground">{p.customerName}</span>
                  </div>
                  <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {p.signals.map((s, i) => (
                      <li key={i} className={s.severity === "critical" ? "text-destructive" : ""}>{s.message}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anggaran dan realisasi biaya (10 proyek aktif)</CardTitle>
        </CardHeader>
        <CardContent>
          {r.budgetVsCost.length === 0 ? (
            <EmptyState title="Belum ada proyek aktif dengan biaya tercatat" />
          ) : (
            <GroupedBarChart
              data={r.budgetVsCost}
              bars={[
                { key: "budget", color: "#3b82f6", label: "Anggaran" },
                { key: "cost", color: "#ef4444", label: "Realisasi Biaya" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Komposisi status proyek</CardTitle></CardHeader><CardContent><SimplePieChart data={r.statusBreakdown} /></CardContent></Card>
    </div>
  );
}
