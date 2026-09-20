/**
 * Bentuk data untuk Project Command Center.
 *
 * Halaman ini belum menyentuh basis data. Tipe di bawah sengaja ditulis
 * lebih dulu supaya tugas backend berikutnya cukup mengisi bentuk yang sama
 * dari Prisma tanpa mengubah satu baris pun di lapisan tampilan.
 *
 * Aturan bisnis yang tetap dipegang di sini, sama seperti summarizeProjectCost():
 *   - actualCost hanya dari ProjectExpense berstatus APPROVED
 *   - pendingCost (DRAFT/SUBMITTED) berdiri sendiri, bukan bagian actual
 *   - committedCost adalah PO vendor yang biayanya belum disetujui
 */

export type CommandStageKey =
  | "COMMERCIAL"
  | "PROCUREMENT"
  | "EXECUTION"
  | "CONTROL";

export type CommandStepState = "DONE" | "ACTIVE" | "BLOCKED" | "TODO";

export interface CommandStep {
  /** Nama dokumen atau pekerjaan, mis. "Costing final", "PO vendor". */
  label: string;
  state: CommandStepState;
  /** Satu baris bukti: nomor dokumen, tanggal, atau jumlah. */
  detail?: string;
  /** Tujuan saat baris diklik; modul yang sudah ada, bukan halaman baru. */
  href?: string;
}

export interface CommandStage {
  key: CommandStageKey;
  title: string;
  /** Kalimat yang menjelaskan pertanyaan apa yang dijawab tahap ini. */
  caption: string;
  steps: CommandStep[];
}

export interface CommandQuickLink {
  label: string;
  href: string;
  /** Angka pendamping, mis. jumlah dokumen pada modul itu. */
  count?: number;
  hint?: string;
}

export interface CommandSnapshot {
  status: string;
  statusLabel: string;
  customerName: string;
  projectManager: string | null;
  number: string;
  jobNumber: string | null;
  /** Persen progres pekerjaan dari milestone, 0–100. */
  progressPercent: number;
  milestonesDone: number;
  milestonesTotal: number;
  daysRemaining: number | null;
  contractValue: number;
  budget: number;
  actualCost: number;
  committedCost: number;
  pendingCost: number;
}

export interface ProjectCommandData {
  projectId: string;
  projectName: string;
  snapshot: CommandSnapshot;
  stages: CommandStage[];
  quickLinks: CommandQuickLink[];
  /** Hal yang menahan proyek, ditampilkan di atas supaya tidak perlu dicari. */
  attention: string[];
  /** Selama masih data tiruan, halaman wajib mengakuinya. */
  isMock: boolean;
}

/**
 * Data tiruan untuk menguji tampilan sebelum kueri aslinya ada.
 * Angkanya dibuat konsisten satu sama lain: actual + committed melewati pagu,
 * supaya keadaan "lewat pagu" ikut terlihat saat diklik-klik.
 */
export function mockProjectCommand(projectId: string): ProjectCommandData {
  const contractValue = 1_250_000_000;
  const budget = 1_050_000_000;
  const actualCost = 920_000_000;
  const committedCost = 80_000_000;
  const pendingCost = 46_500_000;

  return {
    projectId,
    projectName: "Pengadaan dan Instalasi Panel Listrik — Site Cilegon",
    isMock: true,
    snapshot: {
      status: "ACTIVE",
      statusLabel: "Berjalan",
      customerName: "PT Contoh Industri Nusantara",
      projectManager: "Budi Santoso",
      number: "012/PRJ/OPS/IX/2026",
      jobNumber: "JOB-2026-012",
      progressPercent: 68,
      milestonesDone: 4,
      milestonesTotal: 6,
      daysRemaining: 27,
      contractValue,
      budget,
      actualCost,
      committedCost,
      pendingCost,
    },
    attention: [
      "1 milestone lewat tanggal rencana: Uji fungsi panel (rencana 12 Sep).",
      "Perkiraan biaya akhir Rp 1.000.000.000 masih di bawah pagu, tapi jaraknya tinggal 4,8%.",
      "Rp 46.500.000 pengeluaran menunggu persetujuan finance dan belum masuk hitungan mana pun.",
    ],
    stages: [
      {
        key: "COMMERCIAL",
        title: "Komersial",
        caption: "Dari mana pekerjaan ini datang dan berapa nilainya.",
        steps: [
          { label: "Peluang", state: "DONE", detail: "OPP-2026-031 · Won", href: `/sales/opportunities` },
          { label: "Costing final", state: "DONE", detail: "003/CST/MKT/VIII/2026 · pagu Rp 1.050.000.000", href: `/sales/costing` },
          { label: "Penawaran", state: "DONE", detail: "004/QUO/MKT/VIII/2026 · Won", href: `/sales/quotations` },
          { label: "PO pelanggan", state: "DONE", detail: "PO-CIN-4471 · Rp 1.250.000.000", href: `/sales/purchase-orders` },
        ],
      },
      {
        key: "PROCUREMENT",
        title: "Pengadaan",
        caption: "Apa yang sudah dipesan ke vendor dan berapa yang terikat.",
        steps: [
          { label: "PO vendor terkirim", state: "DONE", detail: "3 PO · Rp 610.000.000", href: `/procurement/vendor-po` },
          { label: "PO vendor menunggu konfirmasi", state: "ACTIVE", detail: "1 PO · Rp 80.000.000 masih terikat", href: `/procurement/vendor-po` },
          { label: "Barang diterima", state: "ACTIVE", detail: "2 dari 3 pengiriman", href: `/procurement/vendor-po` },
        ],
      },
      {
        key: "EXECUTION",
        title: "Pelaksanaan",
        caption: "Sudah sampai mana pekerjaannya di lapangan.",
        steps: [
          { label: "Milestone selesai", state: "ACTIVE", detail: "4 dari 6", href: `/projects/${projectId}?tab=progress` },
          { label: "Uji fungsi panel", state: "BLOCKED", detail: "Lewat 8 hari dari rencana 12 Sep", href: `/projects/${projectId}?tab=progress` },
          { label: "Laporan mingguan", state: "DONE", detail: "Minggu ke-9 sudah dikirim", href: `/projects/${projectId}?tab=progress` },
          { label: "Serah terima (BAST)", state: "TODO", detail: "Belum dibuat" },
        ],
      },
      {
        key: "CONTROL",
        title: "Kendali",
        caption: "Apakah uangnya masih sesuai rencana.",
        steps: [
          { label: "Biaya disetujui", state: "ACTIVE", detail: "Rp 920.000.000 dari pagu Rp 1.050.000.000", href: `/finance/expenses?project=${projectId}` },
          { label: "Menunggu persetujuan", state: "BLOCKED", detail: "Rp 46.500.000 belum diputuskan", href: `/finance/expenses?project=${projectId}` },
          { label: "Invoice terbit", state: "ACTIVE", detail: "Rp 750.000.000 dari nilai kontrak", href: `/finance/invoices` },
          { label: "Kas diterima", state: "ACTIVE", detail: "Rp 500.000.000 · piutang Rp 250.000.000", href: `/finance/invoices` },
        ],
      },
    ],
    quickLinks: [
      { label: "Costing", href: `/sales/costing`, count: 2, hint: "1 final" },
      { label: "Penawaran", href: `/sales/quotations`, count: 1, hint: "Won" },
      { label: "PO vendor", href: `/procurement/vendor-po`, count: 4, hint: "1 belum konfirmasi" },
      { label: "Biaya proyek", href: `/finance/expenses?project=${projectId}`, count: 23, hint: "5 menunggu" },
      { label: "Invoice", href: `/finance/invoices`, count: 3, hint: "1 belum lunas" },
      { label: "Dokumen", href: `/projects/${projectId}?tab=documents`, count: 41 },
    ],
  };
}

/** Keadaan satu tahap, disimpulkan dari langkah-langkah di dalamnya. */
export type StageState = "BLOCKED" | "ACTIVE" | "DONE" | "TODO";

/**
 * Menyimpulkan keadaan sebuah tahap dari langkah-langkahnya.
 *
 * Urutannya sengaja: satu langkah tertahan mengalahkan apa pun, karena itulah
 * yang perlu dilihat lebih dulu. Tahap baru disebut selesai kalau seluruh
 * langkahnya selesai — bukan sebagian besar.
 */
export function stageState(stage: CommandStage): StageState {
  const steps = stage.steps;
  if (steps.length === 0) return "TODO";
  if (steps.some((s) => s.state === "BLOCKED")) return "BLOCKED";
  if (steps.every((s) => s.state === "DONE")) return "DONE";
  if (steps.some((s) => s.state === "ACTIVE" || s.state === "DONE")) return "ACTIVE";
  return "TODO";
}

/** Persen langkah selesai pada satu tahap, 0–100. */
export function stageProgress(stage: CommandStage): number {
  if (stage.steps.length === 0) return 0;
  const done = stage.steps.filter((s) => s.state === "DONE").length;
  return Math.round((done / stage.steps.length) * 100);
}

/**
 * Sisa pagu proyek: pagu dikurangi biaya yang sudah disetujui DAN komitmen
 * yang belum jadi biaya.
 *
 * Komitmen ikut dikurangkan dengan sengaja. PO vendor yang sudah terkirim
 * adalah uang yang praktis sudah habis walaupun belum tercatat sebagai
 * biaya; menampilkan sisa pagu tanpa memotongnya akan membuat proyek
 * terlihat lebih longgar daripada keadaan sebenarnya. Nilai negatif berarti
 * sudah lewat pagu.
 */
export function remainingBudget(snapshot: {
  budget: number;
  actualCost: number;
  committedCost: number;
}): number {
  return snapshot.budget - snapshot.actualCost - snapshot.committedCost;
}

/** Batas hari yang membuat sisa waktu ditandai perlu perhatian. */
export const DAYS_REMAINING_WARNING = 14;

/**
 * Bentuk id cuid yang dipakai Prisma untuk Project: huruf "c" diikuti
 * 24 karakter basis-36. Dipakai untuk menolak alamat yang jelas bukan id
 * proyek sebelum repot mencari datanya.
 */
const CUID = /^c[a-z0-9]{20,30}$/;

export function looksLikeProjectId(value: string | undefined | null): boolean {
  return typeof value === "string" && CUID.test(value.trim());
}

/**
 * Memuat data Command Center untuk satu proyek, atau null kalau proyeknya
 * tidak ada.
 *
 * Selama tahap tiruan, "tidak ada" ditentukan dari bentuk id saja — id yang
 * tidak berbentuk cuid pasti bukan proyek. Saat kueri aslinya ditulis, hanya
 * isi fungsi ini yang berubah: halaman sudah menangani null dengan notFound()
 * sejak sekarang, jadi alamat proyek yang salah tidak pernah menampilkan
 * layar berisi angka tiruan seolah-olah itu data nyata.
 */
export async function loadProjectCommand(
  projectId: string,
): Promise<ProjectCommandData | null> {
  if (!looksLikeProjectId(projectId)) return null;
  return mockProjectCommand(projectId);
}
