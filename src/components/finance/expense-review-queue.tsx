import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpenseReviewTable } from "@/components/finance/expense-review-table";
import {
  splitReviewByHolder,
  staleReviewItems,
  sumReview,
  type ExpenseReviewData,
  type ReviewItem,
} from "@/lib/expense-review";
import { formatCurrency } from "@/lib/utils";

/**
 * Antrean tinjauan biaya untuk finance.
 *
 * Daftar menjawab "apa saja yang ada"; antrean menjawab "apa yang harus saya
 * putuskan sekarang". Karena itu isinya hanya yang belum diputuskan, dan
 * urutannya menurut lama menunggu — bukan menurut nilai, yang akan membuat
 * belanja kecil mengendap selamanya padahal justru belanja kecil yang paling
 * sering menghalangi penutupan proyek.
 *
 * Dipisah menurut siapa yang memegang bolanya. Draf yang masih di tangan
 * pengaju tidak bisa ditindak finance sama sekali, dan menaruhnya dalam satu
 * daftar membuat finance merasa punya tunggakan yang bukan miliknya.
 */
export function ExpenseReviewQueue({ data }: { data: ExpenseReviewData }) {
  const { diFinance, diPengaju } = splitReviewByHolder(data.items);
  const mengendap = staleReviewItems(data.items);

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Halaman ini masih memakai <strong>data tiruan</strong>. Nomor dan angkanya
          bukan pengeluaran yang sebenarnya.
        </p>
      )}

      {data.items.length === 0 ? (
        <EmptyState
          title="Tidak ada biaya yang menunggu keputusan"
          description="Semua pengeluaran sudah disetujui atau ditolak. Angka di papan biaya setiap proyek sedang lengkap."
        />
      ) : (
        <>
          {mengendap.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>
                <strong>{mengendap.length} biaya</strong> senilai{" "}
                {formatCurrency(sumReview(mengendap))} sudah mengendap. Selama belum
                diputuskan, posisi biaya proyeknya belum bisa dibaca utuh.
              </span>
            </p>
          )}

          <Antrean
            title="Di meja finance"
            caption="Sudah diajukan, tinggal disetujui atau ditolak."
            items={diFinance}
          />
          <Antrean
            title="Masih di pengaju"
            caption="Masih draf — belum diajukan, jadi belum bisa Anda tindak. Ditampilkan supaya terlihat kalau ada yang tertahan di sana."
            items={diPengaju}
          />
        </>
      )}
    </div>
  );
}

function Antrean({
  title,
  caption,
  items,
}: {
  title: string;
  caption: string;
  items: ReviewItem[];
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <p className="text-xs tabular-nums text-muted-foreground">
            {items.length} biaya · {formatCurrency(sumReview(items))}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">{caption}</p>
      </CardHeader>
      <CardContent>
        <ExpenseReviewTable items={items} />
      </CardContent>
    </Card>
  );
}
