"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { SCurvePoint } from "@/lib/workflows/calculations";

const LINES = [
  { key: "planned", label: "Rencana", color: "#64748b" },
  { key: "actual", label: "Realisasi", color: "#1e293b" },
  { key: "billed", label: "Penagihan", color: "#3b82f6" },
];

export function SCurvePanel({
  points,
  totalWeight,
  asOfToday,
}: {
  points: SCurvePoint[];
  totalWeight: number;
  asOfToday: { planned: number; actual: number; billed: number };
}) {
  const gapActualVsPlanned = round1(asOfToday.actual - asOfToday.planned);
  const gapBilledVsActual = round1(asOfToday.billed - asOfToday.actual);

  return (
    <div className="space-y-4">
      {totalWeight !== 100 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Total bobot milestone saat ini <span className="font-medium">{totalWeight}%</span> — idealnya 100% supaya Kurva S mencerminkan seluruh scope project. Cek tab Milestones untuk melengkapi bobotnya.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Rencana (s/d hari ini)</p><p className="text-lg font-semibold">{asOfToday.planned}%</p></CardContent></Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Realisasi (s/d hari ini)</p>
            <p className="text-lg font-semibold">{asOfToday.actual}%</p>
            <div className="mt-1">
              <Badge variant={gapActualVsPlanned >= 0 ? "success" : "warning"}>
                {gapActualVsPlanned >= 0 ? "Sesuai / lebih cepat dari rencana" : `Terlambat ${Math.abs(gapActualVsPlanned)}% dari rencana`}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Penagihan (kumulatif)</p>
            <p className="text-lg font-semibold">{asOfToday.billed}%</p>
            <div className="mt-1">
              <Badge variant={gapBilledVsActual <= 0 ? "success" : "warning"}>
                {gapBilledVsActual <= 0 ? "Sejalan / tertinggal dari realisasi (aman)" : `Mendahului realisasi ${Math.abs(gapBilledVsActual)}% — cek sebelum invoice berikutnya`}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kurva S — Progress vs Penagihan</CardTitle>
          <CardDescription>Rencana &amp; Realisasi dari bobot milestone; Penagihan dari invoice yang sudah terbit terhadap nilai kontrak.</CardDescription>
        </CardHeader>
        <CardContent>
          {points.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada data untuk kurva. Isi tanggal target &amp; bobot % di tiap Milestone (tab Milestones), lalu tandai selesai seiring pekerjaan berjalan.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => formatDate(new Date(d))} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip labelFormatter={(d: string) => formatDate(new Date(d))} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {LINES.map((l) => (
                  <Line key={l.key} type="stepAfter" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
