import { displayLabel } from "./display-labels";

/**
 * Perhitungan status dan progres proyek.
 *
 * Dipisah dari kueri dan dari tampilan karena tiga hal yang sering
 * dicampur harus tetap terpisah:
 *
 *   STATUS   — apa yang DIKATAKAN orang tentang proyek ini (Project.status,
 *              diubah manual). Sistem tidak pernah mengubahnya sendiri.
 *   PROGRES  — berapa persen pekerjaannya selesai, dari bobot milestone.
 *   KESEHATAN— apakah progres itu wajar untuk waktu yang sudah terpakai.
 *
 * Status bisa saja tertulis "Aktif" sementara kesehatannya tertinggal jauh.
 * Justru selisih itulah yang berguna; menyatukannya jadi satu angka akan
 * menghapus satu-satunya peringatan yang tersedia.
 */

export interface ProgressMilestone {
  status: string;
  dueDate: Date | null;
  completedAt: Date | null;
  weightPercent: number;
}

export type ProgressSource = "MILESTONE_WEIGHT" | "MANUAL";

export interface ProjectProgress {
  percent: number;
  /** Dari mana angka itu berasal — penting karena keduanya tidak sama kuat. */
  source: ProgressSource;
  milestonesDone: number;
  milestonesTotal: number;
  overdueCount: number;
}

/**
 * Progres pekerjaan.
 *
 * Bobot milestone dipakai kalau ada. Proyek dengan lima milestone tidak
 * berarti tiap milestone bernilai 20% — memasang panel dan mengurus izin
 * bukan pekerjaan sebesar itu. Kalau bobot belum diisi sama sekali, kita
 * jatuh ke angka manual di Project.progressPercent, dan MENGAKUINYA lewat
 * `source`, bukan menyamarkan tebakan sebagai perhitungan.
 */
export function computeProjectProgress(input: {
  milestones: ProgressMilestone[];
  manualPercent: number;
  now: Date;
}): ProjectProgress {
  const { milestones, manualPercent, now } = input;
  const totalWeight = milestones.reduce((t, m) => t + m.weightPercent, 0);
  const milestonesDone = milestones.filter((m) => m.completedAt !== null).length;
  const overdueCount = milestones.filter(
    (m) => m.completedAt === null && m.dueDate !== null && m.dueDate < now,
  ).length;

  if (totalWeight <= 0) {
    return {
      percent: clampPercent(manualPercent),
      source: "MANUAL",
      milestonesDone,
      milestonesTotal: milestones.length,
      overdueCount,
    };
  }

  const doneWeight = milestones
    .filter((m) => m.completedAt !== null)
    .reduce((t, m) => t + m.weightPercent, 0);

  return {
    percent: clampPercent(Math.round((doneWeight / totalWeight) * 100)),
    source: "MILESTONE_WEIGHT",
    milestonesDone,
    milestonesTotal: milestones.length,
    overdueCount,
  };
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export type ProjectHealth =
  | "SELESAI"
  | "SESUAI_RENCANA"
  | "TERTINGGAL"
  | "KRITIS"
  | "TIDAK_TERUKUR";

/** Selisih poin progres yang masih dianggap wajar sebelum disebut tertinggal. */
export const HEALTH_LAG_TOLERANCE_POINTS = 10;
/** Selisih poin yang membuatnya disebut kritis. */
export const HEALTH_CRITICAL_LAG_POINTS = 25;

export interface ProjectHealthResult {
  health: ProjectHealth;
  /** Persen waktu proyek yang sudah terpakai, 0–100; null kalau tak terukur. */
  timeElapsedPercent: number | null;
  /** Progres dikurangi waktu terpakai. Negatif berarti tertinggal. */
  lagPoints: number | null;
  reason: string;
}

/**
 * Kesehatan proyek: apakah progres pekerjaan wajar untuk waktu yang sudah
 * terpakai.
 *
 * Membandingkan progres dengan WAKTU, bukan dengan biaya. Proyek yang sudah
 * menghabiskan 80% pagu tapi baru 30% selesai adalah masalah biaya, dan
 * papan biaya yang menjawabnya. Di sini pertanyaannya beda: apakah ia akan
 * selesai tepat waktu.
 *
 * Tanpa tanggal mulai dan selesai, kesehatan TIDAK ditebak. Proyek tanpa
 * jadwal tidak bisa dinilai terlambat, dan berpura-pura bisa hanya akan
 * membuat orang berhenti mempercayai penandanya.
 */
export function computeProjectHealth(input: {
  progressPercent: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  overdueCount: number;
  now: Date;
}): ProjectHealthResult {
  const { progressPercent, startDate, endDate, status, overdueCount, now } = input;

  if (["COMPLETED", "CLOSED"].includes(status)) {
    return {
      health: "SELESAI",
      timeElapsedPercent: 100,
      lagPoints: null,
      reason: "Proyek sudah ditutup",
    };
  }

  if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) {
    return {
      health: "TIDAK_TERUKUR",
      timeElapsedPercent: null,
      lagPoints: null,
      reason: "Tanggal mulai atau selesai belum diisi, jadi keterlambatan tidak bisa dinilai",
    };
  }

  const total = endDate.getTime() - startDate.getTime();
  const elapsed = now.getTime() - startDate.getTime();
  const timeElapsedPercent = clampPercent((elapsed / total) * 100);
  const lagPoints = Math.round(progressPercent - timeElapsedPercent);

  if (lagPoints <= -HEALTH_CRITICAL_LAG_POINTS) {
    return {
      health: "KRITIS",
      timeElapsedPercent,
      lagPoints,
      reason: `Progres ${progressPercent}% sementara ${timeElapsedPercent}% waktu proyek sudah terpakai`,
    };
  }

  if (lagPoints <= -HEALTH_LAG_TOLERANCE_POINTS || overdueCount > 0) {
    return {
      health: "TERTINGGAL",
      timeElapsedPercent,
      lagPoints,
      reason:
        overdueCount > 0
          ? `${overdueCount} milestone lewat tanggal rencana`
          : `Progres ${progressPercent}% sementara ${timeElapsedPercent}% waktu proyek sudah terpakai`,
    };
  }

  return {
    health: "SESUAI_RENCANA",
    timeElapsedPercent,
    lagPoints,
    reason: `Progres ${progressPercent}% terhadap ${timeElapsedPercent}% waktu terpakai`,
  };
}

/**
 * Label status untuk layar.
 *
 * Nilai enum tidak pernah diterjemahkan saat disimpan — hanya saat
 * ditampilkan, lewat kamus yang sama dengan seluruh aplikasi.
 */
export function projectStatusLabel(status: string): string {
  return displayLabel(status);
}

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  SELESAI: "Selesai",
  SESUAI_RENCANA: "Sesuai rencana",
  TERTINGGAL: "Tertinggal",
  KRITIS: "Tertinggal jauh",
  TIDAK_TERUKUR: "Belum bisa dinilai",
};
