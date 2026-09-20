import { PENDING_STALE_DAYS } from "./project-cost-board";
import type { ExpenseCategory } from "@prisma/client";

/**
 * Antrean tinjauan biaya untuk finance.
 *
 * Bedanya dengan daftar biaya biasa: daftar menjawab "apa saja yang ada",
 * antrean menjawab "apa yang harus saya putuskan sekarang". Karena itu
 * urutannya bukan menurut tanggal transaksi melainkan menurut lama
 * menunggu, dan isinya hanya yang belum diputuskan.
 *
 * Satu hal yang dibawa dari jalur struk dan tidak ada di pencatatan manual:
 * kolom mana yang DIUBAH manusia dari hasil baca mesin. Finance yang
 * meninjau perlu tahu angka mana yang datang dari struk dan mana yang
 * diketik ulang — keduanya sah, tapi yang kedua biasanya punya alasan yang
 * pantas ditanyakan.
 */

export interface ReviewItem {
  id: string;
  number: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  description: string;
  vendor: string | null;
  category: ExpenseCategory;
  costTypeCode: string | null;
  amount: number;
  tax: number;
  total: number;
  approvalStatus: "DRAFT" | "SUBMITTED";
  submittedBy: string;
  /** Id pengaju, untuk aturan "tidak boleh menyetujui pengajuan sendiri". */
  submittedById: string;
  /** Hari sejak baris ini MULAI menunggu, bukan sejak tanggal transaksinya. */
  ageDays: number;
  /** Benar kalau draf ini berasal dari struk yang difoto. */
  fromReceipt: boolean;
  /** Ada bukti yang terlampir; tanpa ini finance menyetujui tanpa dasar. */
  hasEvidence: boolean;
  /** Nama kolom yang diubah manusia dari hasil baca. */
  editedFields: string[];
  /**
   * Nilai APA ADANYA hasil baca mesin, untuk diadu dengan nilai sekarang.
   *
   * Tanpa ini, "ada angka yang diubah" hanya sebuah tuduhan tanpa isi:
   * peninjau tahu sesuatu berubah tapi tidak tahu dari berapa ke berapa,
   * dan satu-satunya cara memeriksanya adalah membuka struknya sendiri.
   * null untuk biaya yang memang diketik manual sejak awal.
   */
  extractedSnapshot: {
    vendor: string | null;
    date: string | null;
    amount: number;
    tax: number;
  } | null;
  /** Tanggal transaksi pada draf saat ini, ISO. */
  date: string;
  /** Rincian barang yang tersimpan bersama draf. */
  items: { description: string; quantity: number; unit: string; unitPrice: number }[];
  /** Dokumen bukti, untuk dibuka dari panel detail. */
  evidenceDocumentId: string | null;
  /** Apa saja yang sudah terjadi pada biaya ini. */
  history: ReviewEvent[];
}

export type ReviewEventType =
  | "DIBUAT"
  | "DIAJUKAN"
  | "DIKOREKSI"
  | "DISETUJUI"
  | "DITOLAK"
  | "DIBAYAR";

export interface ReviewEvent {
  type: ReviewEventType;
  at: string;
  by: string;
  /** Alasan penolakan atau catatan koreksi. */
  note?: string | null;
  /** Perubahan nilai pada peristiwa koreksi. */
  changes?: { label: string; before: string; after: string }[];
}

export const REVIEW_EVENT_LABEL: Record<ReviewEventType, string> = {
  DIBUAT: "Dicatat",
  DIAJUKAN: "Diajukan untuk persetujuan",
  DIKOREKSI: "Dikoreksi peninjau",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  DIBAYAR: "Dibayar",
};

/**
 * Riwayat diurutkan dari yang PALING LAMA.
 *
 * Berbeda dari antrean, yang menjawab "apa berikutnya" dan karena itu
 * menaruh yang terbaru di atas. Riwayat menjawab "apa yang sudah terjadi",
 * dan cerita dibaca dari awal — membalik urutannya memaksa pembacanya
 * merangkai sendiri dari belakang.
 */
export function sortReviewHistory(events: ReviewEvent[]): ReviewEvent[] {
  return [...events].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

/** Benar kalau biaya ini pernah dikoreksi orang lain setelah diajukan. */
export function wasCorrected(item: ReviewItem): boolean {
  return item.history.some((e) => e.type === "DIKOREKSI");
}

export interface FieldComparison {
  field: string;
  label: string;
  /** Nilai hasil baca mesin. */
  before: string;
  /** Nilai pada draf sekarang. */
  after: string;
}

const FIELD_LABEL: Record<string, string> = {
  vendor: "Vendor",
  date: "Tanggal",
  amount: "Nilai",
  tax: "Pajak",
};

/**
 * Mengadu nilai hasil baca dengan nilai draf sekarang, kolom per kolom.
 *
 * Inilah yang membuat penanda "angka diubah" berguna dan bukan sekadar
 * tuduhan: peninjau melihat dari berapa ke berapa, dan bisa memutuskan
 * tanpa membuka struknya.
 */
export function fieldComparisons(item: ReviewItem): FieldComparison[] {
  const snap = item.extractedSnapshot;
  if (!snap) return [];
  const sekarang: Record<string, string> = {
    vendor: item.vendor ?? "—",
    date: item.date,
    amount: String(item.amount),
    tax: String(item.tax),
  };
  const sebelum: Record<string, string> = {
    vendor: snap.vendor ?? "—",
    date: snap.date ?? "—",
    amount: String(snap.amount),
    tax: String(snap.tax),
  };
  return item.editedFields
    .filter((f) => f in sebelum)
    .map((field) => ({
      field,
      label: FIELD_LABEL[field] ?? field,
      before: sebelum[field],
      after: sekarang[field],
    }));
}

export interface ExpenseReviewData {
  items: ReviewItem[];
  isMock: boolean;
}

/**
 * Urutan antrean: yang paling lama menunggu lebih dulu.
 *
 * Mengurutkan menurut nilai akan membuat belanja kecil mengendap selamanya,
 * dan justru belanja kecil yang paling sering menghalangi penutupan proyek.
 * Di umur yang sama, yang sudah DIAJUKAN didahulukan — bola ada di tangan
 * finance, sedangkan draf masih di tangan pengajunya.
 */
export function sortReviewQueue(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => {
    if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
    if (a.approvalStatus !== b.approvalStatus) {
      return a.approvalStatus === "SUBMITTED" ? -1 : 1;
    }
    return b.total - a.total;
  });
}

/** Benar kalau nilainya pantas dilihat lebih lama. */
export function isLargeExpense(item: { total: number }): boolean {
  return item.total >= LARGE_EXPENSE_THRESHOLD;
}

/**
 * Umur antrean dikelompokkan supaya bisa dibaca sekilas.
 *
 * Angka hari mentah menuntut pembacanya membandingkan sendiri dengan ambang
 * yang harus dia ingat. Kelompok menjawabnya langsung.
 */
export type AgeBucket = "BARU" | "MENUNGGU" | "MENGENDAP";

export function ageBucket(ageDays: number): AgeBucket {
  if (ageDays >= PENDING_STALE_DAYS) return "MENGENDAP";
  if (ageDays >= 3) return "MENUNGGU";
  return "BARU";
}

export const AGE_BUCKET_LABEL: Record<AgeBucket, string> = {
  BARU: "Baru",
  MENUNGGU: "Menunggu",
  MENGENDAP: "Mengendap",
};

/** Antrean yang sudah mengendap melewati batas. */
export function staleReviewItems(items: ReviewItem[]): ReviewItem[] {
  return sortReviewQueue(items.filter((i) => i.ageDays >= PENDING_STALE_DAYS));
}

/**
 * Memisahkan menurut siapa yang memegang bolanya.
 *
 * SUBMITTED ada di meja finance; DRAFT masih di tangan pengaju dan tidak
 * bisa ditindak finance sama sekali. Menaruh keduanya dalam satu daftar
 * membuat finance merasa punya tunggakan yang sebenarnya bukan miliknya.
 */
export function splitReviewByHolder(items: ReviewItem[]): {
  diFinance: ReviewItem[];
  diPengaju: ReviewItem[];
} {
  return {
    diFinance: sortReviewQueue(items.filter((i) => i.approvalStatus === "SUBMITTED")),
    diPengaju: sortReviewQueue(items.filter((i) => i.approvalStatus === "DRAFT")),
  };
}

export function sumReview(items: ReviewItem[]): number {
  return items.reduce((t, i) => t + i.total, 0);
}

/**
 * Nilai yang membuat sebuah pengeluaran pantas dilihat lebih lama.
 *
 * Bukan batas persetujuan — tidak ada aturan yang berubah di angka ini.
 * Ia hanya menandai baris yang, kalau salah, paling mahal untuk diperbaiki
 * belakangan. Sepuluh juta dipilih karena di perusahaan sebesar SSO itulah
 * kira-kira titik di mana memanggil orang kedua sepadan dengan gangguannya;
 * di bawah itu, memeriksa satu per satu justru memperlambat semuanya tanpa
 * menangkap apa pun.
 */
export const LARGE_EXPENSE_THRESHOLD = 10_000_000;

export type ReviewFlag =
  | "TANPA_BUKTI"
  | "TANPA_JENIS_BIAYA"
  | "ANGKA_DIUBAH"
  | "NILAI_BESAR"
  | "MENGENDAP";

/**
 * Hal yang pantas dilihat finance sebelum memutuskan satu baris.
 *
 * Bukan alasan menolak — hanya penunjuk ke mana mata harus melihat lebih
 * dulu pada antrean yang panjang. Menyetujui baris bertanda tetap sah.
 */
export function reviewFlags(item: ReviewItem): ReviewFlag[] {
  const f: ReviewFlag[] = [];
  if (!item.hasEvidence) f.push("TANPA_BUKTI");
  if (!item.costTypeCode) f.push("TANPA_JENIS_BIAYA");
  if (item.editedFields.length > 0) f.push("ANGKA_DIUBAH");
  if (item.total >= LARGE_EXPENSE_THRESHOLD) f.push("NILAI_BESAR");
  if (item.ageDays >= PENDING_STALE_DAYS) f.push("MENGENDAP");
  return f;
}

export const REVIEW_FLAG_MESSAGE: Record<ReviewFlag, string> = {
  TANPA_BUKTI:
    "Tidak ada berkas terlampir — menyetujuinya berarti menyetujui tanpa dasar tertulis.",
  TANPA_JENIS_BIAYA:
    "Belum punya jenis biaya, jadi tidak akan bisa diadu dengan pagu baseline.",
  ANGKA_DIUBAH: "Ada angka yang diubah manusia dari hasil baca struk.",
  NILAI_BESAR:
    "Nilainya besar — kalau salah, ini yang paling mahal diperbaiki belakangan.",
  MENGENDAP: `Sudah menunggu ${PENDING_STALE_DAYS} hari atau lebih.`,
};

/** Data tiruan: sengaja memuat keempat tanda sekaligus. */
export function mockExpenseReview(): ExpenseReviewData {
  const p1 = {
    projectId: "clx8n2k4p0001qw3f7yz9abcd",
    projectName: "Instalasi Panel Listrik — Site Cilegon",
    projectNumber: "012/PRJ/OPS/IX/2026",
  };
  const p2 = {
    projectId: "clx9m1j3o0002rt4g8xy0efgh",
    projectName: "Servis Gearbox — Plant Bekasi",
    projectNumber: "009/PRJ/OPS/VIII/2026",
  };

  return {
    isMock: true,
    items: [
      {
        ...p2,
        id: "exp-a",
        number: "041/EXP/FIN/IX/2026",
        description: "Sewa forklift 10 hari",
        vendor: "CV Elektrindo Perkasa",
        category: "EQUIPMENT",
        costTypeCode: "SEWA-ALAT",
        amount: 11_500_000,
        tax: 1_000_000,
        total: 12_500_000,
        approvalStatus: "SUBMITTED",
        submittedBy: "Rina Wijaya",
        submittedById: "user-rina",
        ageDays: 11,
        fromReceipt: false,
        hasEvidence: true,
        editedFields: [],
        extractedSnapshot: null,
        date: "2026-09-09",
        items: [],
        evidenceDocumentId: "doc-1",
        history: [
          { type: "DIBUAT", at: "2026-09-09T08:10:00+07:00", by: "Rina Wijaya" },
          { type: "DIAJUKAN", at: "2026-09-09T08:12:00+07:00", by: "Rina Wijaya" },
        ],
      },
      {
        ...p1,
        id: "exp-b",
        number: "044/EXP/FIN/IX/2026",
        description: "Kabel NYY 4x25mm, Skun kabel 25mm, Isolasi 3M tebal",
        vendor: "Toko Sinar Jaya",
        category: "MATERIALS",
        costTypeCode: "MAT-PANEL",
        amount: 8_960_000,
        tax: 996_600,
        total: 9_956_600,
        approvalStatus: "SUBMITTED",
        submittedBy: "Budi Santoso",
        submittedById: "user-budi",
        ageDays: 6,
        fromReceipt: true,
        hasEvidence: true,
        editedFields: ["amount"],
        extractedSnapshot: {
          vendor: "Toko Sinar Jaya",
          date: "2026-09-19",
          amount: 8_960_000,
          tax: 996_600,
        },
        date: "2026-09-19",
        items: [
          { description: "Kabel NYY 4x25mm", quantity: 3, unit: "roll", unitPrice: 2_450_000 },
          { description: "Skun kabel 25mm", quantity: 40, unit: "pcs", unitPrice: 12_500 },
          { description: "Isolasi 3M tebal", quantity: 6, unit: "pcs", unitPrice: 185_000 },
        ],
        evidenceDocumentId: "doc-struk-1",
        history: [
          { type: "DIBUAT", at: "2026-09-14T16:40:00+07:00", by: "Budi Santoso", note: "Dari struk yang difoto di site." },
          { type: "DIAJUKAN", at: "2026-09-14T16:45:00+07:00", by: "Budi Santoso" },
          {
            type: "DIKOREKSI",
            at: "2026-09-16T09:05:00+07:00",
            by: "Pak Direktur",
            note: "Nilai isolasi di struk 1.110.000, bukan 1.210.000 — salah baca.",
            changes: [{ label: "Nilai", before: "9.060.000", after: "8.960.000" }],
          },
        ],
      },
      {
        ...p1,
        id: "exp-c",
        number: "045/EXP/FIN/IX/2026",
        description: "Konsumsi tim lembur",
        vendor: null,
        category: "OTHER",
        costTypeCode: null,
        amount: 1_250_000,
        tax: 0,
        total: 1_250_000,
        approvalStatus: "SUBMITTED",
        submittedBy: "Budi Santoso",
        submittedById: "user-budi",
        ageDays: 3,
        fromReceipt: false,
        hasEvidence: false,
        editedFields: [],
        extractedSnapshot: null,
        date: "2026-09-17",
        items: [],
        evidenceDocumentId: null,
        history: [
          { type: "DIBUAT", at: "2026-09-17T19:20:00+07:00", by: "Budi Santoso" },
          { type: "DIAJUKAN", at: "2026-09-17T19:21:00+07:00", by: "Budi Santoso" },
        ],
      },
      {
        ...p1,
        id: "exp-d",
        number: "046/EXP/FIN/IX/2026",
        description: "Mobilisasi material ke site",
        vendor: "PT Angkutan Jaya",
        category: "TRANSPORTATION",
        costTypeCode: "MOB-SITE",
        amount: 9_000_000,
        tax: 0,
        total: 9_000_000,
        approvalStatus: "DRAFT",
        submittedBy: "Budi Santoso",
        submittedById: "user-budi",
        ageDays: 2,
        fromReceipt: true,
        hasEvidence: true,
        editedFields: ["vendor", "date"],
        extractedSnapshot: {
          vendor: "PT Angkutan Jaja",
          date: "2026-09-16",
          amount: 9_000_000,
          tax: 0,
        },
        date: "2026-09-18",
        items: [
          { description: "Mobilisasi material", quantity: 1, unit: "lot", unitPrice: 9_000_000 },
        ],
        evidenceDocumentId: "doc-2",
        history: [
          { type: "DIBUAT", at: "2026-09-18T11:00:00+07:00", by: "Budi Santoso", note: "Dari struk yang difoto di site." },
          {
            type: "DITOLAK",
            at: "2026-09-18T15:30:00+07:00",
            by: "Pak Direktur",
            note: "Nama vendor salah ketik dan tanggalnya tidak cocok dengan surat jalan. Perbaiki lalu ajukan lagi.",
          },
        ],
      },
    ],
  };
}

export async function loadExpenseReview(): Promise<ExpenseReviewData> {
  return mockExpenseReview();
}

/* ------------------------------------------------------------------ *
 * Siapa yang boleh memutuskan
 * ------------------------------------------------------------------ */

/**
 * Alasan sebuah baris TIDAK bisa diputuskan sekarang, atau null kalau bisa.
 *
 * Aturannya diambil apa adanya dari maker-checker yang sudah berlaku di
 * lib/workflows/expense.ts dan lib/permissions.ts — bukan aturan baru:
 *
 *   - Hanya FINANCE yang menyetujui atau menolak biaya proyek. Ini berlaku
 *     TERMASUK saat pengajunya ADMIN (Direktur) — keputusan eksplisit dari
 *     pemilik sistem: unggahan/biaya milik Direktur sekalipun tetap wajib
 *     lewat persetujuan Finance, bukan disetujui sesama Admin atau diri
 *     sendiri. Admin tidak diberi jalur pintas di sini.
 *   - Tidak boleh menyetujui pengajuan sendiri, termasuk kalau pengaju dan
 *     peninjau kebetulan sama-sama FINANCE.
 *   - Hanya yang sudah DIAJUKAN yang bisa diputuskan; draf masih di tangan
 *     pengajunya.
 *
 * Dikembalikan sebagai kalimat, bukan boolean, supaya tombol yang mati bisa
 * menjelaskan dirinya sendiri. Tombol mati tanpa alasan membuat orang
 * mengira aplikasinya rusak.
 */
export function decisionBlockedReason(
  item: Pick<ReviewItem, "approvalStatus" | "submittedById">,
  actor: { role: string; userId: string },
): string | null {
  if (item.approvalStatus !== "SUBMITTED") {
    return "Masih draf — belum diajukan, jadi belum ada yang bisa diputuskan. Yang bisa menindaknya adalah pengajunya.";
  }
  if (actor.role !== "FINANCE") {
    return "Hanya Finance yang bisa menyetujui atau menolak biaya proyek — berlaku juga untuk biaya yang diajukan Admin (Direktur). Anda tetap bisa memeriksa dan menandai yang perlu ditanyakan.";
  }
  if (actor.userId === item.submittedById) {
    return "Anda sendiri yang mengajukan biaya ini. Minta rekan Finance lain yang memutuskan.";
  }
  return null;
}

/** Panjang minimal alasan penolakan yang berarti. */
export const REJECT_REASON_MIN_LENGTH = 10;

/**
 * Memeriksa alasan penolakan.
 *
 * Wajib, dan tidak boleh sekadar "tidak sesuai". Penolakan tanpa alasan yang
 * bisa ditindak akan kembali lagi dalam bentuk yang sama minggu depan —
 * pengajunya tidak punya cara tahu apa yang harus diperbaiki.
 */
export function rejectReasonProblem(reason: string): string | null {
  const t = reason.trim();
  if (t.length === 0) return "Tulis alasan penolakan.";
  if (t.length < REJECT_REASON_MIN_LENGTH) {
    return `Alasan terlalu pendek (minimal ${REJECT_REASON_MIN_LENGTH} karakter). Pengajunya perlu tahu apa yang harus diperbaiki.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Koreksi sebelum disetujui
 * ------------------------------------------------------------------ */

export interface CorrectionValues {
  description: string;
  vendor: string;
  date: string;
  costTypeCode: string;
  amount: number;
  tax: number;
}

export function correctionFrom(item: ReviewItem): CorrectionValues {
  return {
    description: item.description,
    vendor: item.vendor ?? "",
    date: item.date,
    costTypeCode: item.costTypeCode ?? "",
    amount: item.amount,
    tax: item.tax,
  };
}

export interface CorrectionChange {
  field: keyof CorrectionValues;
  label: string;
  before: string;
  after: string;
}

const CORRECTION_LABEL: Record<keyof CorrectionValues, string> = {
  description: "Keterangan",
  vendor: "Vendor",
  date: "Tanggal",
  costTypeCode: "Jenis biaya",
  amount: "Nilai",
  tax: "Pajak",
};

/** Apa saja yang benar-benar berubah dari draf yang diajukan. */
export function correctionChanges(
  item: ReviewItem,
  next: CorrectionValues,
): CorrectionChange[] {
  const awal = correctionFrom(item);
  return (Object.keys(CORRECTION_LABEL) as (keyof CorrectionValues)[])
    .filter((f) => String(awal[f]) !== String(next[f]))
    .map((field) => ({
      field,
      label: CORRECTION_LABEL[field],
      before: String(awal[field] || "—"),
      after: String(next[field] || "—"),
    }));
}

export const CORRECTION_NOTE_MIN_LENGTH = 10;

/**
 * Memeriksa koreksi sebelum disimpan.
 *
 * Catatan WAJIB, dan itu bukan formalitas. Mengoreksi biaya yang sudah
 * diajukan berarti mengubah angka yang bukan milik Anda: pengajunya mencatat
 * satu hal, dan yang tersimpan menjadi hal lain. Catatan adalah satu-satunya
 * cara dia tahu apa yang terjadi tanpa harus bertanya.
 *
 * Koreksi yang tidak mengubah apa pun ditolak — menyimpan "koreksi" kosong
 * hanya menambah baris riwayat yang tidak menceritakan apa-apa.
 */
export function correctionProblems(
  item: ReviewItem,
  next: CorrectionValues,
  note: string,
  actor: { role: string; userId: string },
): string[] {
  const p: string[] = [];

  // Yang boleh mengoreksi sama dengan yang boleh memutuskan. Mengizinkan
  // orang lain mengubah angka lalu menyerahkannya ke Finance untuk disetujui
  // akan membuat maker-checker kehilangan artinya.
  const terhalang = decisionBlockedReason(item, actor);
  if (terhalang) p.push(terhalang);

  const changes = correctionChanges(item, next);
  if (changes.length === 0) p.push("Belum ada yang diubah.");

  if (!next.description.trim()) p.push("Keterangan tidak boleh kosong.");
  if (!next.date) p.push("Tanggal tidak boleh kosong.");
  if (!(next.amount > 0)) p.push("Nilai harus lebih dari nol.");
  if (next.tax < 0) p.push("Pajak tidak boleh negatif.");

  if (changes.length > 0 && note.trim().length < CORRECTION_NOTE_MIN_LENGTH) {
    p.push(
      `Tulis catatan koreksi, minimal ${CORRECTION_NOTE_MIN_LENGTH} karakter. Pengajunya mencatat satu hal dan yang tersimpan menjadi hal lain — catatan adalah satu-satunya cara dia tahu apa yang terjadi.`,
    );
  }

  return p;
}
