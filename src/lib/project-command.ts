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
  /** Dari mana progres itu berasal — bobot milestone atau angka manual. */
  progressSource: ProgressSource;
  /** Apakah progres itu wajar untuk waktu yang sudah terpakai. */
  health: ProjectHealth;
  healthReason: string;
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
      progressSource: "MILESTONE_WEIGHT",
      health: "TERTINGGAL",
      healthReason: "1 milestone lewat tanggal rencana",
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
      { label: "Papan biaya", href: `/projects/${projectId}/cost-board`, hint: "Baseline vs aktual" },
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
 * Dipertahankan untuk pratinjau tampilan tanpa basis data. Halaman memakai
 * getProjectCommandSummary() dari src/server/projects/command-center.ts;
 * fungsi ini tinggal dipakai saat seseorang ingin melihat bentuk layarnya
 * tanpa data nyata.
 */
export async function loadProjectCommand(
  projectId: string,
): Promise<ProjectCommandData | null> {
  if (!looksLikeProjectId(projectId)) return null;
  return mockProjectCommand(projectId);
}

import { buildProjectStages } from "./project-stages";
import {
  computeProjectHealth,
  computeProjectProgress,
  projectStatusLabel,
  type ProgressSource,
  type ProjectHealth,
} from "./project-progress";

/* ------------------------------------------------------------------ *
 * Penyusun data nyata
 *
 * Dipisah dari kueri supaya bisa diuji tanpa basis data. Server hanya
 * mengambil baris; SELURUH keputusan bentuk ada di sini.
 * ------------------------------------------------------------------ */

export interface ProjectCommandInput {
  project: {
    id: string;
    number: string;
    name: string;
    jobNumber: string | null;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    contractValue: number;
    budget: number;
    progressPercent: number;
    customerName: string;
    projectManagerName: string | null;
  };
  milestones: {
    name: string;
    status: string;
    dueDate: Date | null;
    completedAt: Date | null;
    weightPercent: number;
  }[];
  /** Hasil summarizeProjectCost(), tidak dihitung ulang di sini. */
  cost: {
    actualCost: number;
    committedCost: number;
    pendingCost: number;
    forecastCost: number;
  };
  opportunity: { number: string; status: string } | null;
  costing: { number: string; status: string } | null;
  quotation: { number: string; status: string; grandTotal: number } | null;
  customerPurchaseOrders: { number: string; poValue: number }[];
  vendorPurchaseOrders: { number: string; status: string; grandTotal: number }[];
  /**
   * Angka penagihan diambil jadi dari calculateProjectProfitability(), bukan
   * dihitung ulang di sini: nilai tertagih sebuah invoice DP adalah
   * grandTotal * dpPercent/100, dan menduplikasi aturan itu adalah cara
   * termudah membuat dua halaman menampilkan angka berbeda.
   */
  billing: { totalInvoiced: number; totalPaid: number; invoiceCount: number };
  documentCount: number;
  /** Pesan dari computeProjectRiskSignals(), dipakai apa adanya. */
  riskMessages: string[];
  weeklyReportCount: number;
  now: Date;
}

/** Sisa hari sampai tanggal selesai; null kalau tanggalnya belum diisi. */
export function daysRemaining(endDate: Date | null, now: Date): number | null {
  if (!endDate) return null;
  return Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000);
}

export function buildProjectCommand(input: ProjectCommandInput): ProjectCommandData {
  const { project, milestones, cost, now } = input;

  // Progres dan kesehatan tidak dihitung di sini: keduanya milik
  // computeProjectProgress() dan computeProjectHealth(), yang diuji sendiri.
  const progress = computeProjectProgress({
    milestones,
    manualPercent: project.progressPercent,
    now,
  });
  const health = computeProjectHealth({
    progressPercent: progress.percent,
    startDate: project.startDate,
    endDate: project.endDate,
    status: project.status,
    overdueCount: progress.overdueCount,
    now,
  });

  const milestonesDone = progress.milestonesDone;
  const billed = input.billing.totalInvoiced;
  const paid = input.billing.totalPaid;

  // PO vendor yang belum keluar dari kantor — masih bisa dibatalkan, jadi
  // belum menjadi komitmen. Dipakai sebagai petunjuk pada tautan modul.
  const draftVendorPos = input.vendorPurchaseOrders.filter(
    (v) => !["SENT", "CONFIRMED", "CANCELLED"].includes(v.status),
  );
  const id = project.id;

  const stages = buildProjectStages({
    projectId: id,
    budget: project.budget,
    contractValue: project.contractValue,
    cost,
    milestones,
    opportunity: input.opportunity,
    costing: input.costing,
    quotation: input.quotation,
    customerPurchaseOrders: input.customerPurchaseOrders,
    vendorPurchaseOrders: input.vendorPurchaseOrders,
    billing: input.billing,
    weeklyReportCount: input.weeklyReportCount,
    now,
  });

  const quickLinks: CommandQuickLink[] = [
    { label: "Costing", href: "/sales/costing", hint: input.costing?.status },
    { label: "Penawaran", href: "/sales/quotations", hint: input.quotation?.status },
    {
      label: "PO vendor",
      href: "/procurement/vendor-po",
      count: input.vendorPurchaseOrders.length,
      hint: draftVendorPos.length > 0 ? `${draftVendorPos.length} belum dikirim` : undefined,
    },
    {
      label: "Papan biaya",
      href: `/projects/${id}/cost-board`,
      hint: "Baseline vs aktual",
    },
    {
      label: "Biaya proyek",
      href: `/finance/expenses?project=${id}`,
      hint: cost.pendingCost > 0 ? "ada yang menunggu" : undefined,
    },
    {
      label: "Invoice",
      href: "/finance/invoices",
      count: input.billing.invoiceCount,
      hint: billed - paid > 0 ? "ada piutang" : undefined,
    },
    {
      label: "Dokumen",
      href: `/projects/${id}?tab=documents`,
      count: input.documentCount,
    },
  ];

  return {
    projectId: id,
    projectName: project.name,
    isMock: false,
    snapshot: {
      status: project.status,
      statusLabel: projectStatusLabel(project.status),
      customerName: project.customerName,
      projectManager: project.projectManagerName,
      number: project.number,
      jobNumber: project.jobNumber,
      progressPercent: progress.percent,
      progressSource: progress.source,
      health: health.health,
      healthReason: health.reason,
      milestonesDone,
      milestonesTotal: milestones.length,
      daysRemaining: daysRemaining(project.endDate, now),
      contractValue: project.contractValue,
      budget: project.budget,
      actualCost: cost.actualCost,
      committedCost: cost.committedCost,
      pendingCost: cost.pendingCost,
    },
    stages,
    quickLinks,
    attention: input.riskMessages,
  };
}
