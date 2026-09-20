import { Lock } from "lucide-react";
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
  baselineHistoryRows,
  totalBaselineChange,
  type BaselineVersion,
} from "@/lib/project-baseline";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

/**
 * Riwayat versi baseline.
 *
 * Perubahan lingkup pekerjaan memang terjadi. Yang tidak boleh terjadi
 * adalah perubahan itu menghapus jejak angka sebelumnya — tanpa riwayat,
 * "proyek ini selalu sesuai pagu" bisa selalu benar asal pagunya terus
 * disesuaikan.
 *
 * Kolom perubahan dihitung terhadap versi yang lebih lama, bukan terhadap
 * baris di atasnya, walaupun tabelnya diurutkan dari yang terbaru. Yang
 * dicari orang di sini bukan daftar angka melainkan berapa yang berubah dan
 * kenapa.
 */
export function BaselineHistory({
  history,
  currentId,
}: {
  history: BaselineVersion[];
  currentId: string | null;
}) {
  const rows = baselineHistoryRows(history, currentId);
  const total = totalBaselineChange(history);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Riwayat baseline</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Tanpa riwayat, kalimat &ldquo;proyek ini selalu sesuai pagu&rdquo; bisa
          selalu benar asal pagunya terus disesuaikan.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-0 sm:px-6">
        {rows.length === 0 ? (
          <p className="px-6 text-xs text-muted-foreground sm:px-0">
            Belum ada versi baseline yang tercatat.
          </p>
        ) : (
          <>
            {total !== null && total !== 0 && (
              <p className="mx-6 rounded-md border px-3 py-2 text-xs sm:mx-0">
                Sejak baseline pertama, pagu pembanding{" "}
                <strong className={total > 0 ? "text-destructive" : "text-success"}>
                  {total > 0 ? "naik" : "turun"} {formatCurrency(Math.abs(total))}
                </strong>{" "}
                lewat {rows.length - 1} kali penggantian.
              </p>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Versi</TableHead>
                    <TableHead>Costing</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead className="text-right">Perubahan</TableHead>
                    <TableHead>Ditetapkan</TableHead>
                    <TableHead>Alasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ version: v, delta, isCurrent }) => (
                    <TableRow key={v.id} className={cn(!isCurrent && "opacity-70")}>
                      <TableCell className="whitespace-nowrap">
                        <span className="tabular-nums">v{v.version}</span>
                        {isCurrent && (
                          <Badge variant="default" className="ml-1.5">
                            berlaku
                          </Badge>
                        )}
                        {v.lockedAt && (
                          <Lock
                            className="ml-1.5 inline h-3 w-3 text-muted-foreground"
                            aria-label="terkunci"
                          />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {v.costingNumber}
                        {v.costingRevision > 0 ? `.R${v.costingRevision}` : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(v.amount)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap text-right tabular-nums",
                          delta !== null && delta > 0 && "text-destructive",
                          delta !== null && delta < 0 && "text-success",
                        )}
                      >
                        {delta === null
                          ? "baseline awal"
                          : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatCurrency(
                              Math.abs(delta),
                            )}`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {v.setBy}
                        <br />
                        {formatDateTime(v.setAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {v.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
