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
import { CostComparisonCard } from "@/components/projects/cost-comparison-card";
import {
  varianceStatus,
  varianceToBaseline,
  type CostBoardData,
} from "@/lib/project-cost-board";
import { cn, formatCurrency } from "@/lib/utils";

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

export function ProjectCostBoard({ data }: { data: CostBoardData }) {
  const { baseline, actual, committed, pending, payable, categories } = data;

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Papan ini masih memakai <strong>data tiruan</strong>. Angkanya bukan biaya
          proyek yang sebenarnya — tampilannya dulu yang sedang diuji.
        </p>
      )}

      <CostComparisonCard
        data={{
          baseline,
          actual,
          committed,
          baselineSource: data.baselineSource,
          updatedAt: data.updatedAt,
        }}
      />

      {/* Menunggu persetujuan dan utang dijaga DI LUAR kartu perbandingan:
          yang menunggu belum diputuskan, dan utang adalah soal kas, bukan
          soal apakah biayanya sudah terjadi. */}
      {(pending > 0 || payable > 0) && (
        <div className="space-y-2">
          {pending > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
              <strong>{formatCurrency(pending)}</strong> menunggu persetujuan dan belum
              masuk hitungan mana pun di kartu di atas. Angka di papan ini berubah
              begitu finance memutuskan.
            </p>
          )}
          {payable > 0 && (
            <p className="text-xs text-muted-foreground">
              Dari biaya yang sudah disetujui, {formatCurrency(payable)} belum dibayar.
            </p>
          )}
        </div>
      )}

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
                  // Penanda yang sama dipakai per baris: jenis biaya yang
                  // menggerus baseline harus terlihat tanpa membandingkan
                  // dua kolom angka sendiri.
                  const rowStatus = varianceStatus(row);
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
                          rowStatus === "OVER" && "text-destructive",
                          rowStatus === "NEAR_LIMIT" && "text-warning",
                          rowStatus === "SAFE" && "text-success",
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
