import type { ExpenseCategory } from "@prisma/client";

/**
 * Budget Baseline Proyek.
 *
 * Baseline adalah angka pagu yang DIBEKUKAN dari satu versi costing final,
 * bukan angka hidup. Bedanya penting:
 *
 *   Project.budget    — satu angka yang bisa diubah kapan saja lewat form
 *                       proyek. Berguna, tapi tidak bisa dijadikan pembanding
 *                       karena ia ikut bergerak.
 *   Budget baseline   — salinan beku dari costing final versi tertentu,
 *                       lengkap dengan nomor dan revisinya. Inilah yang
 *                       membuat kalimat "lewat pagu 12%" punya arti, karena
 *                       pagunya tidak bisa diam-diam disesuaikan agar cocok.
 *
 * Karena itu baseline punya riwayat, bukan hanya nilai terakhir. Perubahan
 * lingkup pekerjaan memang terjadi; yang tidak boleh terjadi adalah
 * perubahan itu menghapus jejak angka sebelumnya.
 */

export interface BaselineLine {
  /** Kode jenis biaya, kalau costingnya sudah dipetakan. */
  costTypeCode: string | null;
  label: string;
  category: ExpenseCategory;
  amount: number;
}

export interface BaselineVersion {
  id: string;
  /** Urutan versi baseline pada proyek ini, mulai dari 1. */
  version: number;
  /**
   * Id costing sumbernya, supaya angka baseline bisa ditelusuri sampai ke
   * dokumen aslinya. null kalau costingnya sudah dihapus — baselinenya tetap
   * berlaku, karena ia salinan beku, bukan tautan hidup.
   */
  costingId: string | null;
  /** Nomor costing sumbernya, mis. "003/CST/MKT/VIII/2026". */
  costingNumber: string;
  costingRevision: number;
  amount: number;
  setAt: string;
  setBy: string;
  /** Alasan baseline ini ditetapkan — wajib diisi mulai versi kedua. */
  reason: string | null;
  /** Terkunci berarti tidak bisa diubah lagi, hanya digantikan versi baru. */
  lockedAt: string | null;
  lockedBy: string | null;
  lines: BaselineLine[];
}

export interface ProjectBaselineData {
  projectId: string;
  projectName: string;
  /** Angka pagu hidup pada Project.budget, untuk dibandingkan. */
  projectBudget: number;
  /** Versi yang sedang berlaku; null berarti proyek belum punya baseline. */
  current: BaselineVersion | null;
  /** Seluruh versi, terbaru lebih dulu. */
  history: BaselineVersion[];
  /** Costing final yang tersedia untuk dijadikan baseline. */
  availableCostings: {
    number: string;
    revision: number;
    status: string;
    amount: number;
  }[];
  isMock: boolean;
}

/** Baseline yang sudah dikunci tidak bisa diubah, hanya digantikan. */
export function isLocked(version: BaselineVersion | null): boolean {
  return version?.lockedAt != null;
}

/**
 * Selisih antara pagu hidup di Project.budget dan baseline yang beku.
 *
 * Positif berarti pagu proyek sudah dinaikkan melebihi baseline. Angka ini
 * ditampilkan bukan untuk menyalahkan, melainkan karena dua angka yang
 * berbeda tanpa ada yang menyebutkannya adalah cara termudah membuat orang
 * membaca laporan yang salah: papan biaya memakai Project.budget, sementara
 * orang mengira yang dipakai adalah baseline.
 */
export function budgetDrift(data: {
  projectBudget: number;
  current: BaselineVersion | null;
}): number | null {
  if (!data.current) return null;
  return data.projectBudget - data.current.amount;
}

/**
 * Apakah sebuah costing boleh dijadikan baseline.
 *
 * Hanya costing FINAL atau yang sudah CONVERTED menjadi penawaran. Costing
 * DRAFT masih bisa berubah malam ini juga, dan membekukan angka yang masih
 * bergerak sama saja dengan tidak membekukan apa pun.
 */
export function canBecomeBaseline(costing: { status: string }): boolean {
  return costing.status === "FINAL" || costing.status === "CONVERTED";
}

/** Total seluruh baris, untuk diadu dengan nilai yang tersimpan. */
export function sumBaselineLines(lines: BaselineLine[]): number {
  return lines.reduce((t, l) => t + l.amount, 0);
}

/**
 * Baris baseline yang belum punya jenis biaya.
 *
 * Selama masih ada, pagu per jenis biaya belum bisa dibandingkan dengan
 * realisasinya — dan papan biaya akan tetap menulis "belum dipetakan".
 */
export function unmappedBaselineLines(lines: BaselineLine[]): BaselineLine[] {
  return lines.filter((l) => l.costTypeCode === null);
}

/** Data tiruan untuk menguji tampilan sebelum tabelnya ada. */
export function mockProjectBaseline(projectId: string): ProjectBaselineData {
  const v2Lines: BaselineLine[] = [
    { costTypeCode: "MAT-PANEL", label: "Panel dan komponen listrik", category: "MATERIALS", amount: 520_000_000 },
    { costTypeCode: "UPAH-BORONG", label: "Upah borongan instalasi", category: "LABOR", amount: 240_000_000 },
    { costTypeCode: "JASA-VENDOR", label: "Jasa subkontraktor", category: "VENDOR", amount: 150_000_000 },
    { costTypeCode: "SEWA-ALAT", label: "Sewa forklift dan genset", category: "EQUIPMENT", amount: 60_000_000 },
    { costTypeCode: null, label: "Mobilisasi ke site", category: "TRANSPORTATION", amount: 35_000_000 },
    { costTypeCode: null, label: "Akomodasi tim", category: "ACCOMMODATION", amount: 20_000_000 },
    { costTypeCode: "LAIN-LAIN", label: "Biaya operasional", category: "OTHER", amount: 25_000_000 },
  ];

  const v2: BaselineVersion = {
    id: "bl-2",
    version: 2,
    costingId: "clx0costing0001aaaaaaaaaaa",
    costingNumber: "003/CST/MKT/VIII/2026",
    costingRevision: 1,
    amount: sumBaselineLines(v2Lines),
    setAt: "2026-08-28T10:20:00+07:00",
    setBy: "Rina Wijaya",
    reason: "Tambahan lingkup panel cadangan atas permintaan pelanggan.",
    lockedAt: "2026-08-28T10:25:00+07:00",
    lockedBy: "Rina Wijaya",
    lines: v2Lines,
  };

  const v1Lines: BaselineLine[] = v2Lines.map((l) =>
    l.costTypeCode === "MAT-PANEL" ? { ...l, amount: 460_000_000 } : l,
  );

  const v1: BaselineVersion = {
    id: "bl-1",
    version: 1,
    costingId: null,
    costingNumber: "003/CST/MKT/VIII/2026",
    costingRevision: 0,
    amount: sumBaselineLines(v1Lines),
    setAt: "2026-08-12T09:05:00+07:00",
    setBy: "Rina Wijaya",
    reason: null,
    lockedAt: "2026-08-12T09:06:00+07:00",
    lockedBy: "Rina Wijaya",
    lines: v1Lines,
  };

  return {
    projectId,
    projectName: "Pengadaan dan Instalasi Panel Listrik — Site Cilegon",
    // Sengaja berbeda dari baseline, supaya keadaan "pagu proyek sudah
    // digeser dari baseline" ikut terlihat saat tampilannya diuji.
    projectBudget: 1_050_000_000,
    current: v2,
    history: [v2, v1],
    availableCostings: [
      { number: "003/CST/MKT/VIII/2026", revision: 1, status: "CONVERTED", amount: v2.amount },
      { number: "007/CST/MKT/IX/2026", revision: 0, status: "FINAL", amount: 1_112_000_000 },
      { number: "009/CST/MKT/IX/2026", revision: 0, status: "DRAFT", amount: 980_000_000 },
    ],
    isMock: true,
  };
}

export async function loadProjectBaseline(
  projectId: string,
): Promise<ProjectBaselineData | null> {
  const { looksLikeProjectId } = await import("./project-command");
  if (!looksLikeProjectId(projectId)) return null;
  return mockProjectBaseline(projectId);
}

/**
 * Apakah alasan wajib diisi saat menetapkan baseline.
 *
 * Versi pertama tidak perlu alasan — tidak ada yang digantikan. Mulai versi
 * kedua alasan wajib, karena baseline yang berganti tanpa keterangan
 * menghapus satu-satunya penjelasan kenapa angka pembandingnya bergeser, dan
 * enam bulan kemudian tidak ada yang bisa menjawabnya.
 */
export function reasonRequired(current: BaselineVersion | null): boolean {
  return current !== null;
}

export type SetBaselineProblem =
  | "COSTING_TIDAK_DIPILIH"
  | "COSTING_MASIH_DRAF"
  | "ALASAN_KOSONG"
  | "SAMA_DENGAN_BERLAKU";

/**
 * Memeriksa permintaan penetapan baseline sebelum apa pun disimpan.
 *
 * Mengembalikan daftar masalah, bukan melempar pada masalah pertama: form
 * yang menyebut satu kesalahan lalu menyebut kesalahan berikutnya setelah
 * dikirim ulang membuat orang menebak-nebak.
 */
export function validateSetBaseline(input: {
  costing: { number: string; revision: number; status: string } | null;
  reason: string;
  current: BaselineVersion | null;
}): SetBaselineProblem[] {
  const problems: SetBaselineProblem[] = [];

  if (!input.costing) {
    problems.push("COSTING_TIDAK_DIPILIH");
  } else if (!canBecomeBaseline(input.costing)) {
    problems.push("COSTING_MASIH_DRAF");
  } else if (
    input.current &&
    input.current.costingNumber === input.costing.number &&
    input.current.costingRevision === input.costing.revision
  ) {
    // Menetapkan ulang costing yang sama hanya menambah versi tanpa
    // mengubah angka — riwayat jadi penuh baris yang tidak berarti.
    problems.push("SAMA_DENGAN_BERLAKU");
  }

  if (reasonRequired(input.current) && input.reason.trim().length === 0) {
    problems.push("ALASAN_KOSONG");
  }

  return problems;
}

export const SET_BASELINE_MESSAGE: Record<SetBaselineProblem, string> = {
  COSTING_TIDAK_DIPILIH: "Pilih dulu costing yang akan dijadikan baseline.",
  COSTING_MASIH_DRAF:
    "Costing berstatus draf masih bisa berubah, jadi belum bisa dibekukan jadi baseline.",
  ALASAN_KOSONG:
    "Tulis alasan penggantian baseline — tanpa itu, tidak ada yang bisa menjelaskan kenapa angka pembandingnya bergeser.",
  SAMA_DENGAN_BERLAKU:
    "Costing ini sudah menjadi baseline yang berlaku, jadi tidak ada yang berubah.",
};

/**
 * Siapa yang boleh MEMBUKA kunci baseline.
 *
 * Mengunci boleh dilakukan siapa pun yang berhak mengubah proyek — ia
 * membuat angka lebih sulit digeser, bukan lebih mudah.
 *
 * Membuka kunci berbeda sifatnya. Ia mengizinkan angka pembanding diubah
 * TANPA meninggalkan versi baru, yang berarti laporan bulan lalu bisa
 * berubah arti tanpa jejak. Karena itu hanya ADMIN, dan jalan yang
 * seharusnya ditempuh orang lain adalah menetapkan baseline versi baru —
 * yang justru meninggalkan jejak, lengkap dengan alasannya.
 */
export function canUnlockBaseline(role: string): boolean {
  return role === "ADMIN";
}

/** Alasan wajib saat membuka kunci, dengan panjang minimal yang berarti. */
export const UNLOCK_REASON_MIN_LENGTH = 10;

export function validateUnlockBaseline(input: {
  role: string;
  reason: string;
}): string | null {
  if (!canUnlockBaseline(input.role)) {
    return "Hanya Admin yang boleh membuka kunci baseline. Untuk mengubah angka pembanding, tetapkan baseline versi baru — cara itu meninggalkan jejak beserta alasannya.";
  }
  if (input.reason.trim().length < UNLOCK_REASON_MIN_LENGTH) {
    return `Tulis alasan membuka kunci, minimal ${UNLOCK_REASON_MIN_LENGTH} karakter. Tanpa itu tidak ada yang bisa menjelaskan kenapa angka pembanding boleh berubah tanpa versi baru.`;
  }
  return null;
}

export interface BaselineHistoryRow {
  version: BaselineVersion;
  /** Selisih terhadap versi SEBELUMNYA; null untuk versi pertama. */
  delta: number | null;
  isCurrent: boolean;
}

/**
 * Menyusun riwayat baseline beserta perubahan antarversi.
 *
 * Yang dicari orang di riwayat bukan daftar angka, melainkan BERAPA yang
 * berubah dan kenapa. Nilai tiap versi saja memaksa pembacanya mengurangkan
 * sendiri dua baris yang berjauhan di layar.
 *
 * Diurutkan versi terbaru lebih dulu — itu yang paling sering ditanyakan —
 * tapi selisihnya tetap dihitung terhadap versi yang lebih lama, bukan
 * terhadap baris di atasnya.
 */
export function baselineHistoryRows(
  history: BaselineVersion[],
  currentId: string | null,
): BaselineHistoryRow[] {
  const menurutVersi = [...history].sort((a, b) => a.version - b.version);
  const deltas = new Map<string, number | null>();
  menurutVersi.forEach((v, i) => {
    deltas.set(v.id, i === 0 ? null : v.amount - menurutVersi[i - 1].amount);
  });

  return [...menurutVersi].reverse().map((version) => ({
    version,
    delta: deltas.get(version.id) ?? null,
    isCurrent: version.id === currentId,
  }));
}

/** Total perubahan dari baseline pertama ke yang berlaku sekarang. */
export function totalBaselineChange(history: BaselineVersion[]): number | null {
  if (history.length < 2) return null;
  const menurutVersi = [...history].sort((a, b) => a.version - b.version);
  return (
    menurutVersi[menurutVersi.length - 1].amount - menurutVersi[0].amount
  );
}
