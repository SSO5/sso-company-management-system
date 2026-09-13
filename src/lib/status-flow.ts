import type { QuotationStatus } from "@prisma/client";

/**
 * Menerjemahkan status mentah dari basis data menjadi JALUR TAHAPAN yang
 * bisa dibaca orang.
 *
 * Kenapa perlu berkas tersendiri, bukan sekadar mengganti nama enum:
 *
 * 1. Beberapa status adalah tahap yang SAMA bagi pemakai. SUBMITTED dan
 *    UNDER_REVIEW dua-duanya berarti "sudah diajukan, tinggal menunggu
 *    Direktur" — hanya satu yang perlu tampil sebagai tahap.
 *
 * 2. Sebagian status BUKAN kemajuan, melainkan jalan buntu. REJECTED, LOST,
 *    EXPIRED, dan CANCELLED tidak berada di jalur menuju Menang; kalau
 *    dipaksa masuk barisan, jalurnya jadi bohong. Status seperti itu
 *    ditandai sebagai `terminal` dan digambar terpisah di ujung jalur, pada
 *    tahap terakhir yang benar-benar sempat dilewati.
 *
 * Berkas ini murni soal TAMPILAN. Ia tidak menentukan siapa boleh memindah
 * status apa — itu tetap urusan lib/permissions.ts dan
 * lib/workflows/quotation.ts, dan sengaja tidak disentuh dari sini.
 */
export interface StatusStage {
  key: string;
  label: string;
}

export interface StatusFlowState {
  stages: StatusStage[];
  /** Indeks tahap yang sedang aktif. -1 bila status berhenti di jalan buntu. */
  currentIndex: number;
  /** Tahap terakhir yang sempat dilewati — dipakai saat berhenti di jalan buntu. */
  reachedIndex: number;
  terminal?: { label: string; tone: "danger" | "muted" };
}

const QUOTATION_STAGES: StatusStage[] = [
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Diajukan" },
  { key: "APPROVED", label: "Disetujui" },
  { key: "SENT", label: "Terkirim" },
  { key: "WON", label: "Menang" },
];

/** Tahap terakhir yang wajar sudah dilewati saat sebuah status buntu terjadi. */
const QUOTATION_TERMINAL: Record<string, { label: string; tone: "danger" | "muted"; after: number }> = {
  // Ditolak hanya mungkin setelah diajukan.
  REJECTED: { label: "Ditolak", tone: "danger", after: 1 },
  // Kalah hanya mungkin setelah penawaran sampai ke pelanggan.
  LOST: { label: "Kalah", tone: "danger", after: 3 },
  // Kedaluwarsa dan dibatalkan bukan kegagalan menjual — nadanya lebih datar.
  EXPIRED: { label: "Kedaluwarsa", tone: "muted", after: 3 },
  CANCELLED: { label: "Dibatalkan", tone: "muted", after: 0 },
};

export function quotationFlow(status: QuotationStatus): StatusFlowState {
  const terminal = QUOTATION_TERMINAL[status];
  if (terminal) {
    return {
      stages: QUOTATION_STAGES,
      currentIndex: -1,
      reachedIndex: terminal.after,
      terminal: { label: terminal.label, tone: terminal.tone },
    };
  }

  // UNDER_REVIEW tidak punya kotaknya sendiri: bagi Sales yang menunggu,
  // "sedang ditinjau" dan "sudah diajukan" adalah keadaan yang sama.
  const key = status === "UNDER_REVIEW" ? "SUBMITTED" : status;
  const index = QUOTATION_STAGES.findIndex((s) => s.key === key);
  return {
    stages: QUOTATION_STAGES,
    currentIndex: index,
    reachedIndex: index,
  };
}
