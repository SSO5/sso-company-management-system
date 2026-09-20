import Link from "next/link";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  AGE_BUCKET_LABEL,
  ageBucket,
  isLargeExpense,
  LARGE_EXPENSE_THRESHOLD,
  REVIEW_FLAG_MESSAGE,
  reviewFlags,
  sortReviewQueue,
  sumReview,
  type AgeBucket,
  type ReviewItem,
} from "@/lib/expense-review";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Tabel antrean tinjauan.
 *
 * Bentuk tabel dipakai di sini, bukan kartu, karena pekerjaannya adalah
 * MEMBANDINGKAN: mana yang paling lama, mana yang paling besar, mana yang
 * bisa disapu sekaligus. Kartu bagus untuk membaca satu hal; tabel bagus
 * untuk memilih di antara banyak.
 *
 * Dua kolom penanda yang menentukan urutan mata:
 *
 *   UMUR   — dikelompokkan, bukan angka hari mentah. Angka hari menuntut
 *            pembacanya membandingkan sendiri dengan ambang yang harus dia
 *            ingat; kelompok menjawabnya langsung.
 *   NILAI  — ditebalkan di atas ambang. Bukan batas persetujuan; tidak ada
 *            aturan yang berubah di angka itu. Ia hanya menandai baris yang
 *            kalau salah paling mahal diperbaiki belakangan.
 */

const BUCKET_VARIANT: Record<AgeBucket, "secondary" | "warning" | "destructive"> = {
  BARU: "secondary",
  MENUNGGU: "warning",
  MENGENDAP: "destructive",
};

export function ExpenseReviewTable({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) return null;
  const urut = sortReviewQueue(items);
  const besar = urut.filter(isLargeExpense);

  return (
    <div className="space-y-2">
      {besar.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {besar.length} dari {urut.length} biaya bernilai di atas{" "}
          {formatCurrency(LARGE_EXPENSE_THRESHOLD)}, totalnya{" "}
          {formatCurrency(sumReview(besar))} dari {formatCurrency(sumReview(urut))}.
          Kalau waktu Anda terbatas, mulai dari sana.
        </p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Umur</TableHead>
              <TableHead>Pengeluaran</TableHead>
              <TableHead>Proyek</TableHead>
              <TableHead>Pengaju</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead>Perlu dilihat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {urut.map((item) => {
              const bucket = ageBucket(item.ageDays);
              const flags = reviewFlags(item).filter((f) => f !== "MENGENDAP");
              return (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={BUCKET_VARIANT[bucket]}>
                      {AGE_BUCKET_LABEL[bucket]}
                    </Badge>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {item.ageDays} hari
                    </span>
                  </TableCell>

                  <TableCell>
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="break-words">{item.description}</span>
                      {item.fromReceipt && (
                        <Receipt
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-label="dari struk"
                        />
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {item.number} · {item.vendor ?? "tanpa vendor"} ·{" "}
                      {item.costTypeCode ?? displayLabel(item.category)}
                    </p>
                  </TableCell>

                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/projects/${item.projectId}/cost-board`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {item.projectNumber}
                    </Link>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {item.submittedBy}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular-nums",
                      isLargeExpense(item) && "font-semibold",
                    )}
                  >
                    {formatCurrency(item.total)}
                  </TableCell>

                  <TableCell>
                    {flags.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {flags.map((f) => (
                          <li
                            key={f}
                            className="text-[11px] text-muted-foreground"
                            title={REVIEW_FLAG_MESSAGE[f]}
                          >
                            {LABEL[f]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Penanda di kolom terakhir adalah penunjuk, bukan alasan menolak —
        menyetujui baris bertanda tetap sah.
      </p>
    </div>
  );
}

/** Ringkas untuk kolom sempit; kalimat penuhnya jadi tooltip. */
const LABEL: Record<string, string> = {
  TANPA_BUKTI: "tanpa bukti",
  TANPA_JENIS_BIAYA: "tanpa jenis biaya",
  ANGKA_DIUBAH: "angka diubah",
  NILAI_BESAR: "nilai besar",
};
