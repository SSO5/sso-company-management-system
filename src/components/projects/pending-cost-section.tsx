import Link from "next/link";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayLabel } from "@/lib/display-labels";
import {
  PENDING_STALE_DAYS,
  splitPendingByHolder,
  stalePendingRows,
  sumPending,
  type PendingExpenseRow,
} from "@/lib/project-cost-board";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Bagian "menunggu persetujuan".
 *
 * Berdiri sendiri, di luar kartu perbandingan, karena angka ini BELUM
 * diputuskan. Ia bukan biaya, bukan komitmen, dan bukan sisa pagu —
 * menjumlahkannya ke salah satu dari ketiganya persis kesalahan yang dulu
 * membuat pengeluaran DITOLAK ikut memakan margin proyek.
 *
 * Antrean dipecah menurut siapa yang sedang memegang bolanya: DRAFT masih di
 * tangan pengaju, SUBMITTED sudah di meja finance. Keduanya sama-sama
 * menunggu, tapi yang harus ditegur berbeda.
 */

function PendingRow({ row }: { row: PendingExpenseRow }) {
  const stale = row.ageDays >= PENDING_STALE_DAYS;
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="break-words text-sm">{row.description}</p>
        <p className="text-[11px] text-muted-foreground">
          {displayLabel(row.category)} · diajukan {row.submittedBy} ·{" "}
          <span className={cn(stale && "text-destructive")}>
            {row.ageDays} hari lalu
          </span>
        </p>
      </div>
      <p className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums">
        {formatCurrency(row.amount)}
      </p>
    </div>
  );
}

function Queue({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: PendingExpenseRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium">{title}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {rows.length} biaya · {formatCurrency(sumPending(rows))}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground">{caption}</p>
      <div className="rounded-md border px-3">
        {rows.map((row) => (
          <PendingRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

export function PendingCostSection({
  rows,
  projectId,
}: {
  rows: PendingExpenseRow[];
  projectId: string;
}) {
  if (rows.length === 0) return null;

  const total = sumPending(rows);
  const { diPengaju, diFinance } = splitPendingByHolder(rows);
  const stale = stalePendingRows(rows);

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">Menunggu persetujuan</CardTitle>
          <Badge variant="warning">{formatCurrency(total)}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Belum masuk hitungan aktual, terikat, maupun sisa baseline. Papan biaya
          berubah begitu ini diputuskan — termasuk kalau ditolak.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {stale.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              {stale.length} biaya senilai {formatCurrency(sumPending(stale))} sudah
              menunggu {PENDING_STALE_DAYS} hari atau lebih. Selama belum diputuskan,
              posisi biaya proyek ini belum bisa dibaca utuh.
            </span>
          </p>
        )}

        <Queue
          title="Di meja finance"
          caption="Sudah diajukan, tinggal disetujui atau ditolak."
          rows={diFinance}
        />
        <Queue
          title="Masih di pengaju"
          caption="Masih draf — belum diajukan, jadi finance belum melihatnya."
          rows={diPengaju}
        />

        <Link
          href={`/finance/expenses?project=${projectId}`}
          className="inline-block text-xs text-primary hover:underline"
        >
          Buka daftar biaya proyek →
        </Link>
      </CardContent>
    </Card>
  );
}
