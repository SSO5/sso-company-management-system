import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayLabel } from "@/lib/display-labels";
import {
  categoryShares,
  topCategoriesCovering,
  varianceStatus,
  type CostCategoryRow,
} from "@/lib/project-cost-board";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Proporsi dan peringkat jenis biaya.
 *
 * Tabel rincian menjawab "berapa"; blok ini menjawab "ke mana uangnya pergi".
 * Keduanya membaca baris yang sama, tapi pertanyaannya berbeda: peringkat
 * memberi tahu di mana penghematan sebenarnya mungkin, karena memangkas 5%
 * dari jenis biaya terbesar hampir selalu lebih berarti daripada memangkas
 * habis jenis biaya terkecil.
 *
 * Yang diperingkat adalah belanja nyata — aktual ditambah terikat — bukan
 * baseline. Baseline hanyalah rencana.
 */
export function CostCategoryShares({ rows }: { rows: CostCategoryRow[] }) {
  const shares = categoryShares(rows).filter((s) => s.spend > 0);
  if (shares.length === 0) return null;

  const top = topCategoriesCovering(shares, 80);
  const topPercent = top.reduce((t, s) => t + s.sharePercent, 0);
  const biggest = shares[0].sharePercent;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ke mana uang proyek ini pergi</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Peringkat menurut belanja nyata — aktual ditambah terikat. Yang masih
          menunggu persetujuan tidak dihitung karena belum diputuskan.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {top.length > 0 && top.length < shares.length && (
          <p className="text-xs text-muted-foreground">
            <strong>{top.length}</strong> dari {shares.length} jenis biaya menyumbang{" "}
            <strong>{topPercent.toFixed(0)}%</strong> belanja proyek ini. Penghematan
            yang berarti hampir selalu ada di sana, bukan di jenis biaya terkecil.
          </p>
        )}

        <div className="space-y-2">
          {shares.map((share) => {
            const status = varianceStatus(share.row);
            // Batang diskalakan terhadap jenis biaya TERBESAR, bukan terhadap
            // 100%, supaya perbedaan antar jenis biaya tetap terbaca saat
            // satu jenis mendominasi.
            const width = biggest > 0 ? (share.sharePercent / biggest) * 100 : 0;
            return (
              <div key={share.row.category} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-xs">
                    <span className="mr-1.5 tabular-nums text-muted-foreground">
                      {share.rank}.
                    </span>
                    {displayLabel(share.row.category)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(share.spend)} ·{" "}
                    <span className="font-medium text-foreground">
                      {share.sharePercent.toFixed(1)}%
                    </span>
                  </p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full",
                      status === "OVER"
                        ? "bg-destructive"
                        : status === "NEAR_LIMIT"
                          ? "bg-warning"
                          : "bg-primary",
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Warna batang mengikuti posisi jenis biaya itu terhadap baselinenya: merah
          sudah lewat, kuning hampir mentok.
        </p>
      </CardContent>
    </Card>
  );
}
