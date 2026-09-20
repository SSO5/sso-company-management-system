import type { ExpenseCategory } from "@prisma/client";

/**
 * Bentuk data untuk Papan Biaya Proyek.
 *
 * Papan ini membandingkan tiga angka yang sering tertukar:
 *
 *   BASELINE  — pagu dari costing final. Rencana, bukan kenyataan.
 *   AKTUAL    — biaya yang sudah DISETUJUI. Hanya ini yang benar-benar terjadi.
 *   TERIKAT   — PO vendor terkirim yang biayanya belum disetujui. Uangnya
 *               praktis sudah habis tapi belum tercatat sebagai biaya.
 *
 * Angka "menunggu persetujuan" berdiri sendiri di luar ketiganya, karena
 * belum ada yang memutuskan apakah ia akan menjadi biaya atau ditolak.
 * Menjumlahkannya ke aktual persis kesalahan yang dulu membuat pengeluaran
 * yang DITOLAK ikut memakan margin proyek.
 *
 * Aturannya sama persis dengan summarizeProjectCost() di src/lib/project-cost.ts
 * — papan ini tidak boleh punya definisi sendiri.
 */

export interface CostCategoryRow {
  category: ExpenseCategory;
  baseline: number;
  actual: number;
  committed: number;
  pending: number;
}

export interface CostBoardData {
  projectId: string;
  projectName: string;
  /** Nomor costing yang menjadi baseline, supaya angkanya bisa ditelusuri. */
  baselineSource: string | null;
  baseline: number;
  actual: number;
  committed: number;
  pending: number;
  /** Biaya disetujui yang belum dibayar. */
  payable: number;
  categories: CostCategoryRow[];
  /** Waktu angka ini dihitung, supaya orang tahu sesegar apa yang dibaca. */
  updatedAt: string;
  isMock: boolean;
}

/**
 * Perkiraan biaya saat proyek selesai.
 *
 * Bertahan di baseline selama realisasi ditambah komitmen belum melewatinya,
 * lalu mengikuti belanja. Sama dengan forecastCost pada summarizeProjectCost().
 */
export function forecastAtCompletion(d: {
  baseline: number;
  actual: number;
  committed: number;
}): number {
  return Math.max(d.baseline, d.actual + d.committed);
}

/**
 * Selisih terhadap baseline. Positif berarti hemat, negatif berarti lewat.
 * Ditulis begini supaya tandanya sama dengan cara orang keuangan membacanya.
 */
export function varianceToBaseline(d: {
  baseline: number;
  actual: number;
  committed: number;
}): number {
  return d.baseline - forecastAtCompletion(d);
}

/** Porsi baseline yang sudah terpakai dan terikat, 0–100+ (boleh lewat 100). */
export function consumedPercent(d: {
  baseline: number;
  actual: number;
  committed: number;
}): number {
  if (d.baseline <= 0) return 0;
  return ((d.actual + d.committed) / d.baseline) * 100;
}

/** Data tiruan: angkanya konsisten dengan Command Center supaya tidak bertabrakan. */
export function mockCostBoard(projectId: string): CostBoardData {
  const categories: CostCategoryRow[] = [
    { category: "MATERIALS", baseline: 520_000_000, actual: 498_000_000, committed: 40_000_000, pending: 0 },
    { category: "LABOR", baseline: 240_000_000, actual: 231_500_000, committed: 0, pending: 18_000_000 },
    { category: "VENDOR", baseline: 150_000_000, actual: 110_000_000, committed: 40_000_000, pending: 0 },
    { category: "EQUIPMENT", baseline: 60_000_000, actual: 41_000_000, committed: 0, pending: 12_500_000 },
    { category: "TRANSPORTATION", baseline: 35_000_000, actual: 28_500_000, committed: 0, pending: 9_000_000 },
    { category: "ACCOMMODATION", baseline: 20_000_000, actual: 8_000_000, committed: 0, pending: 7_000_000 },
    { category: "OTHER", baseline: 25_000_000, actual: 3_000_000, committed: 0, pending: 0 },
  ];
  const sum = (k: keyof Omit<CostCategoryRow, "category">) =>
    categories.reduce((t, c) => t + c[k], 0);

  return {
    projectId,
    projectName: "Pengadaan dan Instalasi Panel Listrik — Site Cilegon",
    baselineSource: "003/CST/MKT/VIII/2026",
    baseline: sum("baseline"),
    actual: sum("actual"),
    committed: sum("committed"),
    pending: sum("pending"),
    payable: 125_000_000,
    categories,
    updatedAt: "2026-09-20T09:15:00+07:00",
    isMock: true,
  };
}

export async function loadCostBoard(
  projectId: string,
): Promise<CostBoardData | null> {
  const { looksLikeProjectId } = await import("./project-command");
  if (!looksLikeProjectId(projectId)) return null;
  return mockCostBoard(projectId);
}

/**
 * Ambang "hampir mentok", disamakan dengan BUDGET_NEAR_LIMIT pada
 * computeProjectRiskSignals() supaya papan dan sinyal risiko tidak memberi
 * peringatan pada saat yang berbeda.
 *
 * Satu perbedaan yang disengaja: sinyal risiko mengukur biaya yang sudah
 * disetujui saja, sedangkan papan ini mengukur disetujui DITAMBAH terikat.
 * Papan karena itu menyala lebih dulu — memang itu gunanya, memperingatkan
 * selagi masih ada waktu.
 */
export const BASELINE_NEAR_LIMIT_PERCENT = 90;

export type VarianceStatus = "SAFE" | "NEAR_LIMIT" | "OVER" | "NO_BASELINE";

/** Menyimpulkan posisi belanja terhadap baseline. */
export function varianceStatus(d: {
  baseline: number;
  actual: number;
  committed: number;
}): VarianceStatus {
  if (d.baseline <= 0) return "NO_BASELINE";
  if (varianceToBaseline(d) < 0) return "OVER";
  if (consumedPercent(d) >= BASELINE_NEAR_LIMIT_PERCENT) return "NEAR_LIMIT";
  return "SAFE";
}
