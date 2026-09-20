import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { displayLabel } from "@/lib/display-labels";
import {
  consumedPercent,
  varianceStatus,
  varianceToBaseline,
  withBaselineNumber,
  type CostCategoryRow,
} from "@/lib/project-cost-board";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Rincian biaya per jenis.
 *
 * Total saja tidak pernah memberi tahu apa yang harus diperbaiki. Tabel ini
 * menjawab pertanyaan berikutnya: jenis biaya MANA yang menggerus baseline.
 *
 * Diurutkan dari yang paling bermasalah, bukan menurut abjad atau urutan
 * enum. Baris yang sudah lewat baseline naik ke atas karena baris itulah
 * yang perlu ditindak — mengurutkan menurut nama memaksa orang memindai
 * seluruh tabel untuk menemukannya.
 *
 * Baris berjumlah nol tetap ditampilkan: jenis biaya yang dianggarkan tapi
 * belum terpakai sama sekali adalah informasi, bukan baris kosong.
 */

/** Paling bermasalah lebih dulu: lewat baseline, lalu hampir mentok, lalu sisanya. */
function byUrgency(a: CostCategoryRow, b: CostCategoryRow): number {
  const rank = (r: CostCategoryRow) => {
    const s = varianceStatus(withBaselineNumber(r));
    return s === "OVER" ? 0 : s === "NEAR_LIMIT" ? 1 : 2;
  };
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  // Dalam peringkat yang sama, yang belanjanya terbesar lebih dulu — itu yang
  // paling menggerakkan angka total. Baseline tidak dipakai di sini karena
  // baris tanpa baseline pun tetap harus terurut masuk akal.
  return b.actual + b.committed - (a.actual + a.committed);
}

export function CostCategoryTable({ rows }: { rows: CostCategoryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Rincian per jenis biaya</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Belum ada rincian biaya"
            description="Baseline proyek ini belum dipecah per jenis biaya, atau belum ada pengeluaran yang tercatat."
          />
        </CardContent>
      </Card>
    );
  }

  const sorted = [...rows].sort(byUrgency);
  // Baris tanpa baseline tidak menambah apa pun ke total baseline. Itulah
  // sebabnya total di tabel ini bisa lebih kecil daripada pagu proyek selama
  // pemetaan jenis biaya belum ada — dan itu jujur, bukan bug.
  const total = rows.reduce(
    (t, r) => ({
      baseline: t.baseline + (r.baseline ?? 0),
      actual: t.actual + r.actual,
      committed: t.committed + r.committed,
      pending: t.pending + r.pending,
    }),
    { baseline: 0, actual: 0, committed: 0, pending: 0 },
  );
  const totalVariance = varianceToBaseline(total);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Rincian per jenis biaya</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Jenis biaya mana yang menggerus baseline, bukan sekadar totalnya. Yang
          paling bermasalah ditaruh di atas.
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
                <TableHead className="text-right">Terpakai</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const rowStatus = varianceStatus(withBaselineNumber(row));
                const rowVariance =
                  rowStatus === "NO_BASELINE"
                    ? null
                    : varianceToBaseline(withBaselineNumber(row));
                return (
                  <TableRow key={row.category}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {displayLabel(row.category)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {row.baseline === null ? (
                        <span className="text-muted-foreground">belum dipetakan</span>
                      ) : (
                        formatCurrency(row.baseline)
                      )}
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
                        rowStatus === "SAFE" && "text-muted-foreground",
                      )}
                    >
                      {rowStatus === "NO_BASELINE"
                        ? "—"
                        : `${consumedPercent(withBaselineNumber(row)).toFixed(0)}%`}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap text-right tabular-nums",
                        rowStatus === "OVER" && "text-destructive",
                        rowStatus === "NEAR_LIMIT" && "text-warning",
                        rowStatus === "SAFE" && "text-success",
                      )}
                    >
                      {rowVariance === null
                        ? "—"
                        : `${rowVariance < 0 ? "−" : ""}${formatCurrency(Math.abs(rowVariance))}`}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Baris total ada supaya tabel ini bisa diadu langsung dengan
                  kartu perbandingan di atasnya. Kalau keduanya berbeda, salah
                  satunya salah — dan itu harus kelihatan. */}
              <TableRow className="font-medium">
                <TableCell className="whitespace-nowrap">Total</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatCurrency(total.baseline)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatCurrency(total.actual)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {total.committed > 0 ? formatCurrency(total.committed) : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {total.pending > 0 ? formatCurrency(total.pending) : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {total.baseline > 0 ? `${consumedPercent(total).toFixed(0)}%` : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-nowrap text-right tabular-nums",
                    totalVariance < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {totalVariance < 0 ? "−" : ""}
                  {formatCurrency(Math.abs(totalVariance))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
