import { CostComparisonCard } from "@/components/projects/cost-comparison-card";
import { CostCategoryTable } from "@/components/projects/cost-category-table";
import { PendingCostSection } from "@/components/projects/pending-cost-section";
import type { CostBoardData } from "@/lib/project-cost-board";
import { formatCurrency } from "@/lib/utils";

/**
 * Papan Biaya Proyek.
 *
 * Tiga angka berdampingan — Baseline, Aktual, Terikat — lalu satu angka
 * "menunggu persetujuan" yang sengaja DIPISAH dari ketiganya. Yang menunggu
 * belum diputuskan: menjumlahkannya ke aktual persis kesalahan yang dulu
 * membuat pengeluaran DITOLAK ikut memakan margin proyek.
 *
 * Semua perhitungan datang dari fungsi murni di project-cost-board.ts yang
 * mengikuti aturan summarizeProjectCost(). Tidak ada rumus baru di sini.
 */

export function ProjectCostBoard({ data }: { data: CostBoardData }) {
  const { baseline, actual, committed, payable, categories } = data;

  return (
    <div className="space-y-4">
      {data.isMock && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Papan ini masih memakai <strong>data tiruan</strong>. Angkanya bukan biaya
          proyek yang sebenarnya — tampilannya dulu yang sedang diuji.
        </p>
      )}

      <CostComparisonCard
        data={{
          baseline,
          actual,
          committed,
          baselineSource: data.baselineSource,
          updatedAt: data.updatedAt,
        }}
      />

      {/* Menunggu persetujuan dijaga DI LUAR kartu perbandingan: yang
          menunggu belum diputuskan. Utang adalah soal kas, bukan soal apakah
          biayanya sudah terjadi, jadi juga tidak masuk ke sana. */}
      <PendingCostSection rows={data.pendingRows} projectId={data.projectId} />

      {payable > 0 && (
        <p className="text-xs text-muted-foreground">
          Dari biaya yang sudah disetujui, {formatCurrency(payable)} belum dibayar.
        </p>
      )}

      <CostCategoryTable rows={categories} />
    </div>
  );
}
