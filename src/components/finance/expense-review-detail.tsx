"use client";

import Link from "next/link";
import { ArrowRight, FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseCorrectionForm } from "@/components/finance/expense-correction-form";
import { ExpenseDecisionActions } from "@/components/finance/expense-decision-actions";
import { displayLabel } from "@/lib/display-labels";
import {
  fieldComparisons,
  REVIEW_FLAG_MESSAGE,
  reviewFlags,
  type ReviewItem,
} from "@/lib/expense-review";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Panel detail satu draf biaya.
 *
 * Yang dibuka peninjau di sini adalah hal-hal yang TIDAK muat di tabel tapi
 * menentukan keputusannya:
 *
 *   - PERBANDINGAN HASIL BACA vs SEKARANG. Tanpa ini, penanda "ada angka
 *     yang diubah" hanya tuduhan tanpa isi: peninjau tahu sesuatu berubah
 *     tapi tidak tahu dari berapa ke berapa, dan satu-satunya cara
 *     memeriksanya adalah membuka struknya sendiri.
 *   - RINCIAN BARANG, supaya "belanja apa" terjawab tanpa berpindah halaman.
 *   - TAUTAN KE BUKTINYA, atau pernyataan jelas bahwa buktinya tidak ada.
 *
 * Keputusannya ada di bawah, memanggil alur persetujuan yang sudah berlaku —
 * bukan jalur baru khusus halaman ini.
 */
export function ExpenseReviewDetail({
  item,
  actor,
  onClose,
}: {
  item: ReviewItem | null;
  actor: { role: string; userId: string };
  onClose: () => void;
}) {
  if (!item) return null;
  const flags = reviewFlags(item);
  const perubahan = fieldComparisons(item);

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(next) => !next && onClose()}
      title={item.description}
      description={`${item.number} · ${item.projectNumber} ${item.projectName}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info label="Vendor" value={item.vendor ?? "— tidak diisi —"} />
          <Info label="Tanggal" value={formatDate(item.date)} />
          <Info
            label="Jenis biaya"
            value={item.costTypeCode ?? `— belum dipetakan (${displayLabel(item.category)}) —`}
          />
          <Info label="Pengaju" value={`${item.submittedBy} · ${item.ageDays} hari lalu`} />
          <Info label="Nilai" value={formatCurrency(item.amount)} />
          <Info label="Pajak" value={formatCurrency(item.tax)} />
        </div>

        <p className="rounded-md border px-3 py-2 text-sm">
          Total <strong className="tabular-nums">{formatCurrency(item.total)}</strong>
          {item.fromReceipt && (
            <Badge variant="secondary" className="ml-2">
              <Receipt className="mr-1 h-3 w-3" /> dari struk
            </Badge>
          )}
        </p>

        {/* Perbandingan yang membuat penanda "angka diubah" bisa ditindak. */}
        {perubahan.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Diubah dari hasil baca struk</p>
            <ul className="space-y-1">
              {perubahan.map((p) => (
                <li
                  key={p.field}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">{p.label}:</span>
                  <span className="text-muted-foreground line-through">{p.before}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{p.after}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Diubah manusia setelah struk dibaca. Wajar dan sah — tapi biasanya
              punya alasan yang pantas ditanyakan kalau selisihnya besar.
            </p>
          </div>
        )}

        {item.items.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Rincian barang</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Uraian</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">Harga satuan</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.items.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{b.description}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {b.quantity} {b.unit}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(b.unitPrice)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(b.quantity * b.unitPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium">Bukti</p>
          {item.evidenceDocumentId ? (
            <Link
              href={`/documents?doc=${item.evidenceDocumentId}`}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <FileText className="h-3.5 w-3.5" /> Buka berkas bukti
            </Link>
          ) : (
            <p className="text-xs text-destructive">
              Tidak ada berkas terlampir. Menyetujuinya berarti menyetujui tanpa
              dasar tertulis.
            </p>
          )}
        </div>

        {flags.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Perlu dilihat</p>
            <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
              {flags.map((f) => (
                <li key={f}>{REVIEW_FLAG_MESSAGE[f]}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          <p className="text-sm font-medium">Keputusan</p>
          <ExpenseDecisionActions item={item} actor={actor} onDone={onClose} />
          <ExpenseCorrectionForm item={item} actor={actor} />
        </div>
      </div>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="break-words">{value}</p>
    </div>
  );
}
