import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BASELINE_NEAR_LIMIT_PERCENT,
  consumedPercent,
  forecastAtCompletion,
  varianceStatus,
  varianceToBaseline,
  type VarianceStatus,
} from "@/lib/project-cost-board";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

/**
 * Kartu perbandingan Baseline vs Aktual vs Terikat.
 *
 * Tiga angka yang paling sering tertukar, berdampingan, dengan satu batang
 * yang bentuknya sendiri sudah menjawab "masih aman atau tidak" sebelum
 * satu angka pun dibaca:
 *
 *   BASELINE — pagu dari costing final. Rencana, bukan kenyataan.
 *   AKTUAL   — biaya yang sudah DISETUJUI. Hanya ini yang benar-benar terjadi.
 *   TERIKAT  — PO vendor terkirim yang belum jadi biaya. Uangnya praktis
 *              sudah habis tapi belum tercatat.
 *
 * Kartu ini tidak menerima angka "menunggu persetujuan" sama sekali. Itu
 * disengaja: yang menunggu belum diputuskan, dan pemisahannya ditegakkan di
 * batas komponen supaya tidak ada yang bisa diam-diam menjumlahkannya ke
 * aktual di kemudian hari.
 */

export interface CostComparison {
  baseline: number;
  actual: number;
  committed: number;
  /** Nomor costing sumber baseline, supaya angkanya bisa ditelusuri. */
  baselineSource?: string | null;
  updatedAt?: string | null;
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
  tone?: "default" | "good" | "bad" | "muted";
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-base font-semibold tabular-nums sm:text-lg",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Penanda selisih terhadap baseline.
 *
 * Angka selisih saja menuntut pembacanya menghitung sendiri apakah itu
 * banyak atau sedikit. Penanda ini yang menjawabnya, dengan ambang yang
 * sama persis dengan sinyal risiko proyek supaya keduanya tidak pernah
 * memberi peringatan pada saat yang berbeda.
 */
const varianceBadge: Record<
  VarianceStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  SAFE: { label: "Dalam baseline", variant: "success" },
  NEAR_LIMIT: { label: `Hampir mentok (≥${BASELINE_NEAR_LIMIT_PERCENT}%)`, variant: "warning" },
  OVER: { label: "Lewat baseline", variant: "destructive" },
  NO_BASELINE: { label: "Baseline belum ditetapkan", variant: "outline" },
};

export function CostComparisonCard({ data }: { data: CostComparison }) {
  const { baseline, actual, committed } = data;
  const forecast = forecastAtCompletion(data);
  const variance = varianceToBaseline(data);
  const consumed = consumedPercent(data);
  const status = varianceStatus(data);
  const badge = varianceBadge[status];

  // Skala batang: selalu sampai angka terbesar antara baseline dan perkiraan,
  // supaya bagian yang melewati pagu benar-benar terlihat keluar dari garis.
  const scale = Math.max(baseline, forecast, 1);
  const w = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const overrun = Math.max(0, forecast - baseline);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="min-w-0 break-words">Papan biaya proyek</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Baseline dari costing final
          {data.baselineSource ? ` ${data.baselineSource}` : ""}. Aktual hanya
          menghitung pengeluaran yang sudah disetujui.
          {data.updatedAt ? ` Diperbarui ${formatDateTime(data.updatedAt)}.` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          <Figure
            label="Baseline"
            value={formatCurrency(baseline)}
            hint="Pagu dari costing final"
          />
          <Figure label="Aktual" value={formatCurrency(actual)} hint="Sudah disetujui" />
          <Figure
            label="Terikat"
            value={formatCurrency(committed)}
            hint="PO vendor terkirim, belum jadi biaya"
          />
          <Figure
            label={variance >= 0 ? "Sisa terhadap baseline" : "Lewat baseline"}
            value={`${variance < 0 ? "−" : ""}${formatCurrency(Math.abs(variance))}`}
            tone={status === "OVER" ? "bad" : status === "NEAR_LIMIT" ? "default" : "good"}
            hint={`Perkiraan akhir ${formatCurrency(forecast)}`}
          />
        </div>

        {baseline > 0 && (
          <div className="space-y-1.5">
            <div className="relative h-6 overflow-hidden rounded-md bg-muted">
              <div
                className="absolute inset-y-0 left-0 bg-primary"
                style={{ width: w(actual) }}
              />
              <div
                className="absolute inset-y-0 bg-primary/50"
                style={{ left: w(actual), width: w(committed) }}
              />
              {overrun > 0 && (
                <div
                  className="absolute inset-y-0 bg-destructive"
                  style={{ left: w(baseline), width: w(overrun) }}
                />
              )}
              {/* Garis ambang "hampir mentok" ditarik sebelum garis baseline,
                  supaya peringatannya terbaca sebagai jarak, bukan sebagai
                  kejutan saat garis baseline sudah terlewati. */}
              <div
                className="absolute inset-y-0 w-px bg-warning"
                style={{ left: w((baseline * BASELINE_NEAR_LIMIT_PERCENT) / 100) }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground"
                style={{ left: w(baseline) }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Terpakai {formatCurrency(actual)}</span>
              {committed > 0 && <span>Terikat {formatCurrency(committed)}</span>}
              <span>Garis baseline {formatCurrency(baseline)}</span>
              <span>{consumed.toFixed(1)}% baseline terpakai dan terikat</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
