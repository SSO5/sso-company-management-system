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
  /**
   * Pagu untuk jenis biaya ini, atau null kalau belum bisa diketahui.
   *
   * null BUKAN nol. CostingLineItem tidak punya ExpenseCategory sama sekali —
   * ia hanya punya nama barang dan seksi — sehingga pagu per jenis biaya
   * belum bisa diturunkan dari costing final. Memakai nol di sini akan
   * membuat setiap jenis biaya terbaca "lewat baseline" sejak rupiah
   * pertama. Pemetaannya baru ada setelah Master Jenis Biaya (Fase 2).
   */
  baseline: number | null;
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
  /**
   * Angka Baseline/Aktual/Terikat beserta turunannya, dalam bentuk yang sama
   * persis dengan yang dikembalikan endpoint ringkasan. Disimpan sebagai satu
   * objek, bukan disebar jadi field terpisah, supaya papan dan ringkasan
   * tidak bisa berselisih.
   */
  summary: CostSummary;
  categories: CostCategoryRow[];
  pendingRows: PendingExpenseRow[];
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

/**
 * Menyiapkan satu baris untuk fungsi hitung yang menuntut baseline berupa
 * angka. Baris tanpa baseline diberi nol, yang oleh varianceStatus() dibaca
 * sebagai NO_BASELINE — bukan sebagai "pagunya habis".
 */
export function withBaselineNumber(row: {
  baseline: number | null;
  actual: number;
  committed: number;
}): { baseline: number; actual: number; committed: number } {
  return { ...row, baseline: row.baseline ?? 0 };
}

/**
 * Porsi baseline yang sudah terpakai dan terikat, 0–100+ (boleh lewat 100).
 *
 * Dibulatkan ke dua desimal di sumbernya. Pembagian pecahan biner
 * menghasilkan nilai seperti 110.00000000000001, dan angka itu bukan hanya
 * jelek di layar — ia juga dibandingkan dengan ambang 90%, tempat derau
 * sekecil itu bisa membalik keputusan di kasus persis di batas.
 */
export function consumedPercent(d: {
  baseline: number;
  actual: number;
  committed: number;
}): number {
  if (d.baseline <= 0) return 0;
  return Math.round(((d.actual + d.committed) / d.baseline) * 100 * 100) / 100;
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
    categories.reduce((t, c) => t + (c[k] ?? 0), 0);

  return {
    projectId,
    projectName: "Pengadaan dan Instalasi Panel Listrik — Site Cilegon",
    summary: summarizeCostBoard({
      baseline: sum("baseline"),
      actual: sum("actual"),
      committed: sum("committed"),
      pending: sum("pending"),
      payable: 125_000_000,
      baselineSource: "Baseline v2 dari costing 003/CST/MKT/VIII/2026.R1 (terkunci)",
      // Waktu hitung sengaja diambil saat dipanggil, bukan nilai tetap: itulah
      // satu-satunya cara membuktikan bahwa penyegaran benar-benar menjalankan
      // ulang pemuatan data, bukan hanya menampilkan ulang halaman yang sama.
      updatedAt: new Date().toISOString(),
    }),
    categories,
    pendingRows: [
      { id: "exp-1", description: "Upah borongan instalasi minggu ke-9", category: "LABOR", amount: 18_000_000, approvalStatus: "SUBMITTED", submittedBy: "Budi Santoso", ageDays: 6 },
      { id: "exp-2", description: "Sewa forklift 10 hari", category: "EQUIPMENT", amount: 12_500_000, approvalStatus: "SUBMITTED", submittedBy: "Rina Wijaya", ageDays: 11 },
      { id: "exp-3", description: "Mobilisasi material ke site", category: "TRANSPORTATION", amount: 9_000_000, approvalStatus: "DRAFT", submittedBy: "Budi Santoso", ageDays: 2 },
      { id: "exp-4", description: "Penginapan tim uji fungsi", category: "ACCOMMODATION", amount: 7_000_000, approvalStatus: "DRAFT", submittedBy: "Rina Wijaya", ageDays: 1 },
    ],
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

/**
 * Menyusun satu baris antrean dari satu baris ProjectExpense.
 *
 * Dua keputusan sengaja dikunci di satu tempat yang bisa diuji, karena
 * keduanya mudah salah dan akibatnya menimpa orang:
 *
 *   - NAMA PENGAJU. submittedBy baru terisi SETELAH diajukan, jadi baris yang
 *     masih draf memakai pembuatnya. Nama yang salah di antrean persetujuan
 *     berarti orang yang salah yang ditegur.
 *   - UMUR BARIS. Dihitung dari saat ia MULAI menunggu — tanggal pengajuan
 *     untuk yang sudah diajukan, tanggal dibuat untuk yang masih draf — bukan
 *     dari tanggal transaksinya. Struk bulan lalu yang baru diajukan kemarin
 *     belum mengendap sebulan.
 */
export function toPendingRow(
  e: {
    id: string;
    description: string;
    category: ExpenseCategory;
    total: unknown;
    approvalStatus: string;
    submittedAt: Date | null;
    createdAt: Date;
    createdBy: { name: string };
    submittedBy: { name: string } | null;
  },
  now: Date = new Date(),
): PendingExpenseRow {
  const waitingSince = e.submittedAt ?? e.createdAt;
  return {
    id: e.id,
    description: e.description,
    category: e.category,
    amount: Number(e.total),
    approvalStatus: e.approvalStatus as "DRAFT" | "SUBMITTED",
    submittedBy: (e.submittedBy ?? e.createdBy).name,
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - waitingSince.getTime()) / 86_400_000),
    ),
  };
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

/**
 * Ringkasan Baseline / Aktual / Terikat beserta angka turunannya.
 *
 * Dipisah dari CostBoardData karena dipakai di dua tempat dengan kebutuhan
 * berbeda: papan biaya memuat seluruh rincian, sedangkan pemanggil lain
 * (penyegaran, Command Center) hanya butuh empat angka ini. Keduanya harus
 * memakai perhitungan yang sama, bukan dua salinan.
 */
export interface CostSummary {
  baseline: number;
  actual: number;
  committed: number;
  pending: number;
  payable: number;
  /** Biaya saat proyek selesai nanti. */
  forecast: number;
  /** Positif berarti hemat, negatif berarti lewat baseline. */
  variance: number;
  /** Porsi baseline yang sudah terpakai dan terikat. */
  consumedPercent: number;
  status: VarianceStatus;
  baselineSource: string | null;
  updatedAt: string;
}

/**
 * Melengkapi angka mentah menjadi ringkasan siap pakai.
 *
 * Empat angka dasar masuk, angka turunannya keluar — supaya tidak ada
 * pemanggil yang menghitung perkiraan atau selisih dengan caranya sendiri.
 */
export function summarizeCostBoard(input: {
  baseline: number;
  actual: number;
  committed: number;
  pending: number;
  payable: number;
  baselineSource: string | null;
  updatedAt: string;
}): CostSummary {
  return {
    ...input,
    forecast: forecastAtCompletion(input),
    variance: varianceToBaseline(input),
    consumedPercent: consumedPercent(input),
    status: varianceStatus(input),
  };
}

/* ------------------------------------------------------------------ *
 * Agregasi dari baris nyata
 * ------------------------------------------------------------------ */

export interface CostAggregationInput {
  expenses: {
    category: ExpenseCategory;
    total: number;
    approvalStatus: string;
    paymentStatus: string;
  }[];
  /** PO vendor yang sudah keluar kantor, beserta status biaya tertautnya. */
  vendorPos: {
    category: ExpenseCategory | null;
    grandTotal: number;
    expenseApprovalStatus: string | null;
  }[];
  /** Pagu per jenis biaya, kalau sudah bisa dipetakan. Kosong berarti belum. */
  baselinePerCategory?: Partial<Record<ExpenseCategory, number>>;
}

/**
 * Meringkas biaya proyek per jenis biaya.
 *
 * Aturannya identik dengan summarizeProjectCost() dan sengaja diulang di
 * sini HANYA pada sumbu yang berbeda (per jenis biaya, bukan total):
 *
 *   - hanya APPROVED yang menjadi aktual
 *   - DRAFT dan SUBMITTED masuk menunggu, bukan aktual
 *   - REJECTED tidak dihitung sama sekali
 *   - PO vendor yang biayanya sudah APPROVED TIDAK dihitung lagi sebagai
 *     komitmen, karena ia sudah masuk lewat barisnya sendiri
 *
 * Jenis biaya yang tidak punya satu baris pun dibuang: menampilkan delapan
 * baris nol hanya menyembunyikan yang benar-benar terpakai.
 */
export function aggregateCostByCategory(
  input: CostAggregationInput,
): CostCategoryRow[] {
  const rows = new Map<ExpenseCategory, CostCategoryRow>();
  const baselines = input.baselinePerCategory ?? {};

  const rowFor = (category: ExpenseCategory): CostCategoryRow => {
    let row = rows.get(category);
    if (!row) {
      row = {
        category,
        baseline: baselines[category] ?? null,
        actual: 0,
        committed: 0,
        pending: 0,
      };
      rows.set(category, row);
    }
    return row;
  };

  for (const e of input.expenses) {
    const row = rowFor(e.category);
    if (e.approvalStatus === "APPROVED") row.actual += e.total;
    else if (e.approvalStatus === "DRAFT" || e.approvalStatus === "SUBMITTED") {
      row.pending += e.total;
    }
    // REJECTED sengaja tidak masuk ke mana pun.
  }

  for (const v of input.vendorPos) {
    if (v.expenseApprovalStatus === "APPROVED") continue;
    // PO vendor tanpa jenis biaya jatuh ke OTHER, bukan dibuang: uang yang
    // terikat harus tetap kelihatan walau pengelompokannya belum rapi.
    rowFor(v.category ?? "OTHER").committed += v.grandTotal;
  }

  // Jenis biaya yang punya pagu tapi belum terpakai tetap ditampilkan —
  // anggaran yang belum tersentuh adalah informasi, bukan baris kosong.
  for (const key of Object.keys(baselines) as ExpenseCategory[]) {
    if (baselines[key] != null) rowFor(key);
  }

  return [...rows.values()];
}
