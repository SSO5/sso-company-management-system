import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, cn } from "@/lib/utils";

/**
 * Mini-P&L per proyek.
 *
 * Kenapa dipisah jadi tiga baris, bukan satu deret dua belas angka:
 *
 *   1. UNTUNG RUGI  — apakah pekerjaan ini menghasilkan uang
 *   2. ARUS KAS     — apakah uangnya sudah benar-benar masuk
 *   3. KENDALI BIAYA— apakah biayanya masih terkendali
 *
 * Ketiganya menjawab pertanyaan yang berbeda dan biasanya ditanyakan orang
 * yang berbeda pula. Menumpuknya jadi satu deret memaksa semua orang membaca
 * dua belas angka untuk menemukan satu yang ia cari.
 *
 * Seluruh angka datang dari calculateProjectProfitability() — tidak ada yang
 * dihitung ulang di sini, supaya laporan dan layar tidak bisa berbeda.
 */
export interface ProjectFinancials {
  contractValue: number;
  budget: number;
  actualCost: number;
  budgetRemaining: number;
  committedCost: number;
  pendingCost: number;
  forecastCost: number;
  payable: number;
  totalInvoiced: number;
  totalPaid: number;
  totalWithheld: number;
  outstanding: number;
  grossProfit: number;
  grossMargin: number;
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
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
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

const pct = (n: number) => `${n.toFixed(1)}%`;

export function ProjectFinancialView({ data }: { data: ProjectFinancials }) {
  const {
    contractValue, budget, actualCost, committedCost, pendingCost, forecastCost,
    payable, totalInvoiced, totalPaid, totalWithheld, outstanding,
    grossProfit, grossMargin,
  } = data;

  const overBudget = forecastCost - budget;
  const collectedPercent = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;
  const invoicedPercent = contractValue > 0 ? (totalInvoiced / contractValue) * 100 : 0;

  // Skala batang: selalu sampai angka terbesar antara pagu dan perkiraan,
  // supaya bagian yang melewati pagu benar-benar terlihat keluar dari garis.
  const scale = Math.max(budget, forecastCost, 1);
  const w = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;

  return (
    <div className="space-y-4">
      {/* 1 — UNTUNG RUGI */}
      <Card>
        <CardHeader>
          <CardTitle>Untung rugi</CardTitle>
          <p className="text-xs text-muted-foreground">
            Biaya hanya menghitung pengeluaran yang sudah disetujui.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Figure label="Nilai kontrak" value={formatCurrency(contractValue)} />
          <Figure label="Biaya aktual" value={formatCurrency(actualCost)}
            hint={contractValue > 0 ? `${pct((actualCost / contractValue) * 100)} dari nilai kontrak` : undefined} />
          <Figure label="Laba kotor" value={formatCurrency(grossProfit)}
            tone={grossProfit >= 0 ? "good" : "bad"} />
          <Figure label="Margin" value={pct(grossMargin)}
            tone={grossProfit >= 0 ? "good" : "bad"} />
        </CardContent>
      </Card>

      {/* 2 — ARUS KAS */}
      <Card>
        <CardHeader>
          <CardTitle>Arus kas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Piutang adalah uang yang sudah ditagih tapi belum masuk. Utang adalah biaya yang sudah
            disetujui tapi belum dibayar.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Figure label="Invoice terbit" value={formatCurrency(totalInvoiced)}
            hint={contractValue > 0 ? `${pct(invoicedPercent)} dari nilai kontrak` : undefined} />
          <Figure label="Kas diterima" value={formatCurrency(totalPaid)}
            hint={totalInvoiced > 0 ? `${pct(collectedPercent)} dari yang ditagih` : undefined} />
          <Figure label="Piutang" value={formatCurrency(outstanding)}
            tone={outstanding > 0 ? "bad" : "muted"} />
          <Figure label="Utang" value={formatCurrency(payable)}
            tone={payable > 0 ? "bad" : "muted"} />
        </CardContent>
        {totalWithheld > 0 && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              PPh dipotong pelanggan: {formatCurrency(totalWithheld)} — sudah dibayarkan atas nama SSO,
              bukan piutang.
            </p>
          </CardContent>
        )}
      </Card>

      {/* 3 — KENDALI BIAYA */}
      <Card>
        <CardHeader>
          <CardTitle>Kendali biaya</CardTitle>
          <p className="text-xs text-muted-foreground">
            Perkiraan adalah biaya saat proyek selesai nanti — inilah satu-satunya angka yang bisa
            memperingatkan selagi masih ada waktu.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Figure label="Pagu (dari costing)" value={formatCurrency(budget)} />
            <Figure label="Terikat" value={formatCurrency(committedCost)}
              hint="PO vendor terkirim, belum jadi biaya" />
            <Figure label="Perkiraan akhir" value={formatCurrency(forecastCost)} />
            <Figure
              label={overBudget > 0 ? "Lewat pagu" : "Sisa pagu"}
              value={formatCurrency(Math.abs(overBudget))}
              tone={overBudget > 0 ? "bad" : "good"}
              hint={budget > 0 ? `${pct((Math.abs(overBudget) / budget) * 100)} dari pagu` : undefined}
            />
          </div>

          {/* Batang: terpakai, terikat, lalu garis pagu. Bentuknya sendiri
              sudah memberi tahu apakah sudah lewat, tanpa perlu dibaca. */}
          {budget > 0 && (
            <div className="space-y-1.5">
              <div className="relative h-6 overflow-hidden rounded-md bg-muted">
                <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: w(actualCost) }} />
                <div
                  className="absolute inset-y-0 bg-primary/50"
                  style={{ left: w(actualCost), width: w(committedCost) }}
                />
                {overBudget > 0 && (
                  <div
                    className="absolute inset-y-0 bg-destructive"
                    style={{ left: w(budget), width: w(overBudget) }}
                  />
                )}
                <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: w(budget) }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>Terpakai {formatCurrency(actualCost)}</span>
                {committedCost > 0 && <span>Terikat {formatCurrency(committedCost)}</span>}
                <span>Garis pagu {formatCurrency(budget)}</span>
              </div>
            </div>
          )}

          {pendingCost > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
              {formatCurrency(pendingCost)} pengeluaran masih menunggu persetujuan dan belum masuk
              hitungan mana pun di atas. Angka di halaman ini akan berubah setelah diputuskan.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
