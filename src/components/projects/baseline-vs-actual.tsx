import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  baselineNotComparable,
  pairBaselineWithActual,
  spendOutsideBaseline,
  type BaselineLine,
} from "@/lib/project-baseline";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

/**
 * Baseline diadu dengan realisasi, per jenis biaya.
 *
 * Inilah yang membuat baseline berguna dan bukan sekadar angka arsip: begitu
 * ada biaya baru disetujui, baris di sini bergerak. Angkanya datang dari
 * sumber yang sama dengan papan biaya, jadi keduanya tidak bisa berselisih.
 *
 * Dua keadaan ditampilkan menonjol karena keduanya adalah cara pembengkakan
 * luput dari perhatian:
 *
 *   BELUM DIPETAKAN  — pagu yang tidak bisa diadu dengan apa pun. Kalau
 *                      diperlakukan nol, ia akan terlihat hemat 100%.
 *   DI LUAR BASELINE — uang keluar pada jenis biaya yang memang tidak pernah
 *                      dianggarkan, jadi ia tidak muncul sebagai "lewat pagu"
 *                      di baris mana pun.
 */
export function BaselineVsActual({
  lines,
  realisation,
  realisationAt,
}: {
  lines: BaselineLine[];
  realisation: { costTypeCode: string; actual: number; committed: number }[];
  realisationAt: string;
}) {
  const rows = pairBaselineWithActual(lines, realisation);
  const diLuar = spendOutsideBaseline(rows);
  const belumBisaDiadu = baselineNotComparable(rows);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Baseline dibanding realisasi</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Bergerak setiap kali ada biaya disetujui. Angkanya dari sumber yang sama
          dengan papan biaya · dihitung {formatDateTime(realisationAt)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-0 sm:px-6">
        {(diLuar > 0 || belumBisaDiadu > 0) && (
          <div className="mx-6 space-y-1.5 sm:mx-0">
            {diLuar > 0 && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                <strong>{formatCurrency(diLuar)}</strong> dibelanjakan pada jenis biaya
                yang tidak ada di baseline. Karena tidak punya pagu, belanja ini tidak
                pernah muncul sebagai &ldquo;lewat pagu&rdquo; di baris mana pun —
                inilah bentuk pembengkakan yang paling mudah luput.
              </p>
            )}
            {belumBisaDiadu > 0 && (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                <strong>{formatCurrency(belumBisaDiadu)}</strong> pagu belum bisa
                diadu karena barisnya belum punya jenis biaya.
              </p>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uraian</TableHead>
                <TableHead className="text-right">Pagu</TableHead>
                <TableHead className="text-right">Terpakai</TableHead>
                <TableHead className="text-right">Terikat</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.costTypeCode ?? "x"}-${i}`}>
                  <TableCell>
                    <p className="text-sm">{r.label}</p>
                    {r.gap === "BELUM_DIPETAKAN" && (
                      <Badge variant="warning">Belum dipetakan</Badge>
                    )}
                    {r.gap === "DI_LUAR_BASELINE" && (
                      <Badge variant="destructive">Di luar baseline</Badge>
                    )}
                    {r.gap === null && r.costTypeCode && (
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {r.costTypeCode}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {r.baseline === null ? (
                      <span className="text-muted-foreground">tidak dianggarkan</span>
                    ) : (
                      formatCurrency(r.baseline)
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatCurrency(r.actual)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {r.committed > 0 ? formatCurrency(r.committed) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular-nums",
                      r.remaining !== null && r.remaining < 0 && "text-destructive",
                      r.remaining !== null && r.remaining >= 0 && "text-success",
                    )}
                  >
                    {r.remaining === null
                      ? "—"
                      : `${r.remaining < 0 ? "−" : ""}${formatCurrency(
                          Math.abs(r.remaining),
                        )}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
