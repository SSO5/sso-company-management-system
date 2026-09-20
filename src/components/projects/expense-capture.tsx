import { FileText, TriangleAlert, Upload } from "lucide-react";
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
  CAPTURE_WARNING_MESSAGE,
  captureWarnings,
  lineDrift,
  RECONCILE_TOLERANCE,
  suggestedAmount,
  sumItems,
  type ExpenseCaptureDraft,
} from "@/lib/expense-capture";
import { CaptureDraftForm } from "@/components/projects/capture-draft-form";
import { ReceiptUploadArea } from "@/components/projects/receipt-upload-area";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

/**
 * Smart Expense Capture.
 *
 * Susunannya mengikuti urutan orang memeriksa: apa yang dibaca mesin, apa
 * yang mencurigakan, lalu baru rinciannya. Peringatan ditaruh SEBELUM tabel
 * karena tabel yang panjang membuat orang berhenti membaca di baris ketiga.
 *
 * Yang tidak dilakukan halaman ini: menolak struk yang ganjil. Struk yang
 * totalnya tidak cocok tetap boleh jadi draf — finance yang memutuskan.
 * Peringatan menentukan apa yang harus DILIHAT, bukan apa yang boleh
 * dilakukan.
 */
export function ExpenseCapture({ data }: { data: ExpenseCaptureDraft }) {
  const { extracted } = data;
  const warnings = captureWarnings(extracted);
  const jumlahBaris = extracted ? sumItems(extracted.items) : 0;
  const usulan = suggestedAmount(extracted);

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Halaman ini masih memakai <strong>data tiruan</strong>. Struk dan angkanya
          bukan pengeluaran yang sebenarnya — tampilannya dulu yang sedang diuji.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Struk yang diunggah</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Berkasnya tersimpan sebagai bukti walau pembacaannya gagal. Kehilangan
            bukti karena mesin tidak bisa membacanya jauh lebih merugikan daripada
            harus mengetik ulang.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReceiptUploadArea />

          {data.fileName ? (
            <p className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="break-all">{data.fileName}</span>
              <Badge variant="secondary">Tersimpan</Badge>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4 shrink-0" /> Belum ada struk yang tersimpan
              untuk proyek ini.
            </p>
          )}

          {data.extractionError && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
              Pembacaan otomatis gagal: {data.extractionError}. Berkasnya tetap
              tersimpan — isi angkanya manual, hasilnya sama saja.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Peringatan mendahului rincian: tabel panjang membuat orang berhenti
          membaca sebelum sampai ke hal yang perlu diperiksa. */}
      {warnings.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlert className="h-4 w-4 text-warning" /> Periksa dulu sebelum
            menyimpan
          </p>
          <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{CAPTURE_WARNING_MESSAGE[w]}</li>
            ))}
          </ul>
        </div>
      )}

      {extracted && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hasil baca</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Semuanya usulan, bukan fakta. Setiap angka masih bisa diubah sebelum
              disimpan sebagai draf.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
              <Figure
                label="Vendor"
                value={extracted.vendor ?? "— tidak terbaca —"}
                tone={extracted.vendor ? "default" : "bad"}
              />
              <Figure
                label="Tanggal"
                value={extracted.date ? formatDate(extracted.date) : "— tidak terbaca —"}
                tone={extracted.date ? "default" : "bad"}
              />
              <Figure
                label="Total tercetak"
                value={
                  extracted.total === null
                    ? "— tidak terbaca —"
                    : formatCurrency(extracted.total)
                }
                tone={extracted.total === null ? "bad" : "default"}
              />
              <Figure
                label="Diusulkan untuk draf"
                value={formatCurrency(usulan)}
                hint={
                  extracted.total !== null
                    ? "Dari total yang tercetak"
                    : extracted.items.length > 0
                      ? "Dari jumlah baris — total tidak terbaca"
                      : "Belum ada angka; isi manual"
                }
              />
            </div>

            {extracted.items.length > 0 && (
              <div className="space-y-1.5">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Uraian</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead className="text-right">Harga satuan</TableHead>
                        <TableHead className="text-right">Nilai baris</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extracted.items.map((item, i) => {
                        const drift = lineDrift(item);
                        const ganjil = Math.abs(drift) > RECONCILE_TOLERANCE;
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-sm">
                              {item.description}
                              {ganjil && (
                                <Badge variant="warning" className="ml-1.5">
                                  perlu dicek
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">
                              {item.quantity} {item.unit}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">
                              {formatCurrency(item.unitPrice)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "whitespace-nowrap text-right tabular-nums",
                                ganjil && "text-warning",
                              )}
                            >
                              {formatCurrency(item.total)}
                              {ganjil && (
                                <span className="block text-[11px]">
                                  hitungan: {formatCurrency(item.quantity * item.unitPrice)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Angka yang diadu ditulis terang-terangan, bukan cuma
                    disimpulkan jadi "ada yang tidak cocok". */}
                <p className="text-[11px] text-muted-foreground">
                  Jumlah baris {formatCurrency(jumlahBaris)}
                  {extracted.tax ? ` + pajak ${formatCurrency(extracted.tax)}` : ""} ={" "}
                  {formatCurrency(jumlahBaris + (extracted.tax ?? 0))} · total tercetak{" "}
                  {extracted.total === null
                    ? "tidak terbaca"
                    : formatCurrency(extracted.total)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CaptureDraftForm data={data} />

      <p className="text-xs text-muted-foreground">
        Apa pun hasil pembacaannya, yang terbentuk adalah biaya proyek berstatus{" "}
        <strong>DRAF</strong> yang wajib ditinjau finance sebelum masuk hitungan mana
        pun. Sampai disetujui, angkanya tidak menyentuh papan biaya.
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-base font-semibold tabular-nums sm:text-lg",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
