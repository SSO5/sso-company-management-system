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

/** Satu baris antrean: biaya yang belum diputuskan finance. */
export interface PendingExpenseRow {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  /** DRAFT belum diajukan; SUBMITTED sudah di meja finance. */
  approvalStatus: "DRAFT" | "SUBMITTED";
  submittedBy: string;
  /** Umur baris dalam hari, dipakai untuk menandai yang mengendap. */
  ageDays: number;
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
  pendingRows: PendingExpenseRow[];
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
    pendingRows: [
      { id: "exp-1", description: "Upah borongan instalasi minggu ke-9", category: "LABOR", amount: 18_000_000, approvalStatus: "SUBMITTED", submittedBy: "Budi Santoso", ageDays: 6 },
      { id: "exp-2", description: "Sewa forklift 10 hari", category: "EQUIPMENT", amount: 12_500_000, approvalStatus: "SUBMITTED", submittedBy: "Rina Wijaya", ageDays: 11 },
      { id: "exp-3", description: "Mobilisasi material ke site", category: "TRANSPORTATION", amount: 9_000_000, approvalStatus: "DRAFT", submittedBy: "Budi Santoso", ageDays: 2 },
      { id: "exp-4", description: "Penginapan tim uji fungsi", category: "ACCOMMODATION", amount: 7_000_000, approvalStatus: "DRAFT", submittedBy: "Rina Wijaya", ageDays: 1 },
    ],
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

/** Batas hari sebelum sebuah draf biaya dianggap mengendap di antrean. */
export const PENDING_STALE_DAYS = 7;

/** Baris menunggu yang sudah terlalu lama, diurutkan dari yang paling tua. */
export function stalePendingRows(
  rows: PendingExpenseRow[],
  staleDays: number = PENDING_STALE_DAYS,
): PendingExpenseRow[] {
  return rows
    .filter((r) => r.ageDays >= staleDays)
    .sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Memisahkan antrean berdasarkan siapa yang sedang memegang bolanya.
 *
 * DRAFT masih di tangan pengaju; SUBMITTED sudah di meja finance. Keduanya
 * sama-sama "menunggu" bagi papan biaya, tapi yang harus ditegur berbeda,
 * jadi pemisahan ini bukan sekadar hiasan tampilan.
 */
export function splitPendingByHolder(rows: PendingExpenseRow[]): {
  diPengaju: PendingExpenseRow[];
  diFinance: PendingExpenseRow[];
} {
  return {
    diPengaju: rows.filter((r) => r.approvalStatus === "DRAFT"),
    diFinance: rows.filter((r) => r.approvalStatus === "SUBMITTED"),
  };
}

export function sumPending(rows: PendingExpenseRow[]): number {
  return rows.reduce((t, r) => t + r.amount, 0);
}

export interface CategoryShare {
  row: CostCategoryRow;
  /** Peringkat menurut belanja nyata, 1 = terbesar. */
  rank: number;
  /** Porsi terhadap total belanja (aktual + terikat), 0–100. */
  sharePercent: number;
  /** Belanja nyata baris ini: aktual ditambah terikat. */
  spend: number;
}

/**
 * Memeringkat jenis biaya menurut belanja nyata.
 *
 * Yang diperingkat adalah aktual DITAMBAH terikat, bukan baseline. Baseline
 * hanyalah rencana; pertanyaan "ke mana uang proyek ini sebenarnya pergi"
 * hanya bisa dijawab oleh uang yang sudah terpakai dan yang sudah terikat.
 *
 * Nilai yang menunggu persetujuan tidak ikut, dengan alasan yang sama
 * seperti di tempat lain: belum ada yang memutuskan apakah ia jadi biaya.
 */
export function categoryShares(rows: CostCategoryRow[]): CategoryShare[] {
  const spendOf = (r: CostCategoryRow) => r.actual + r.committed;
  const total = rows.reduce((t, r) => t + spendOf(r), 0);
  return [...rows]
    .sort((a, b) => spendOf(b) - spendOf(a))
    .map((row, i) => ({
      row,
      rank: i + 1,
      spend: spendOf(row),
      sharePercent: total > 0 ? (spendOf(row) / total) * 100 : 0,
    }));
}

/**
 * Berapa jenis biaya teratas yang sudah menutupi sebagian besar belanja.
 * Dipakai untuk kalimat semacam "3 jenis biaya menyumbang 80% belanja" —
 * yang memberi tahu di mana harus mencari penghematan.
 */
export function topCategoriesCovering(
  shares: CategoryShare[],
  targetPercent = 80,
): CategoryShare[] {
  const out: CategoryShare[] = [];
  let acc = 0;
  for (const s of shares) {
    if (s.spend <= 0) break;
    out.push(s);
    acc += s.sharePercent;
    if (acc >= targetPercent) break;
  }
  return out;
}
