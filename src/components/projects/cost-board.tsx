import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayLabel } from "@/lib/display-labels";
import {
  consumedPercent,
  forecastAtCompletion,
  varianceToBaseline,
  type CostBoardData,
} from "@/lib/project-cost-board";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

/**
 * Papan Biaya Proyek.
 *
 * Tiga angka berdampingan — Baseline, Aktual, Terikat — lalu satu angka
 * "menunggu persetujuan" yang sengaja DIPISAH dari ketiganya. Yang menunggu
 * belum diputuskan: menjumlahkannya ke aktual persis kesalahan yang dulu
 * membuat pengeluaran DITOLAK ikut memakan margin proyek.
 *
 * Semua perhitungan datang dari fungsi murni di project-cost-board.ts yang
 * mengikuti aturan summarizeProjectCost(). Tidak ada rumus baru di sini.
 */

function Figure({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "muted";
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-base font-semibold tabular-nums sm:text-lg",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProjectCostBoard({ data }: { data: CostBoardData }) {
  const { baseline, actual, committed, pending, payable, categories } = data;
  const forecast = forecastAtCompletion(data);
  const variance = varianceToBaseline(data);
  const consumed = consumedPercent(data);

  // Skala batang: selalu sampai angka terbesar antara baseline dan perkiraan,
  // supaya bagian yang melewati pagu benar-benar terlihat keluar dari garis.
  const scale = Math.max(baseline, forecast, 1);
  const w = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const overrun = Math.max(0, forecast - baseline);

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Papan ini masih memakai <strong>data tiruan</strong>. Angkanya bukan biaya
          proyek yang sebenarnya — tampilannya dulu yang sedang diuji.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="min-w-0 break-words">Papan biaya proyek</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Baseline dari costing final
            {data.baselineSource ? ` ${data.baselineSource}` : ""}. Aktual hanya
            menghitung pengeluaran yang sudah disetujui. Diperbarui{" "}
            {formatDateTime(data.updatedAt)}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            <Figure label="Baseline" value={formatCurrency(baseline)} hint="Pagu dari costing final" />
            <Figure label="Aktual" value={formatCurrency(actual)} hint="Sudah disetujui" />
            <Figure
              label="Terikat"
              value={formatCurrency(committed)}
              hint="PO vendor terkirim, belum jadi biaya"
            />
            <Figure
              label={variance >= 0 ? "Sisa terhadap baseline" : "Lewat baseline"}
              value={formatCurrency(Math.abs(variance))}
              tone={variance >= 0 ? "good" : "bad"}
              hint={`Perkiraan akhir ${formatCurrency(forecast)}`}
            />
          </div>

          {baseline > 0 && (
            <div className="space-y-1.5">
              <div className="relative h-6 overflow-hidden rounded-md bg-muted">
                <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: w(actual) }} />
                <div
                  className="absolute inset-y-0 bg-primary/50"
                  style={{ left: w(actual), width: w(committed) }}
                />
                {overrun > 0 && (
                  <div
                    className="absolute inset-y-0 bg-destructive"
                    style={{ left: w(baseline), width: w(overrun) }}
                  />
                )}
                <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: w(baseline) }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>Terpakai {formatCurrency(actual)}</span>
                {committed > 0 && <span>Terikat {formatCurrency(committed)}</span>}
                <span>Garis baseline {formatCurrency(baseline)}</span>
                <span>{consumed.toFixed(1)}% baseline terpakai dan terikat</span>
              </div>
            </div>
          )}

          {/* Menunggu persetujuan berdiri sendiri, di luar ketiga angka di
              atas — belum ada yang memutuskan apakah ia jadi biaya. */}
          {pending > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
              <strong>{formatCurrency(pending)}</strong> menunggu persetujuan dan belum
              masuk hitungan mana pun di atas. Angka di papan ini berubah begitu
              finance memutuskan.
            </p>
          )}

          {payable > 0 && (
            <p className="text-xs text-muted-foreground">
              Dari biaya yang sudah disetujui, {formatCurrency(payable)} belum dibayar.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Rincian per jenis biaya</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Jenis biaya mana yang menggerus baseline, bukan sekadar totalnya.
          </p>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jenis biaya</TableHead>
                  <TableHead className="text-right">Baseline</TableHead>
                  <TableHead className="text-right">Aktual</TableHead>
                  <TableHead className="text-right">Terikat</TableHead>
                  <TableHead className="text-right">Menunggu</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((row) => {
                  const rowVariance = varianceToBaseline(row);
                  return (
                    <TableRow key={row.category}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {displayLabel(row.category)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(row.baseline)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(row.actual)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {row.committed > 0 ? formatCurrency(row.committed) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {row.pending > 0 ? formatCurrency(row.pending) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap text-right tabular-nums",
                          rowVariance < 0 ? "text-destructive" : "text-success",
                        )}
                      >
                        {rowVariance < 0 ? "−" : ""}
                        {formatCurrency(Math.abs(rowVariance))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
