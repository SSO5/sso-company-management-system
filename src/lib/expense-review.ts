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
  /** Hari sejak baris ini MULAI menunggu, bukan sejak tanggal transaksinya. */
  ageDays: number;
  /** Benar kalau draf ini berasal dari struk yang difoto. */
  fromReceipt: boolean;
  /** Ada bukti yang terlampir; tanpa ini finance menyetujui tanpa dasar. */
  hasEvidence: boolean;
  /** Nama kolom yang diubah manusia dari hasil baca. */
  editedFields: string[];
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

export type ReviewFlag =
  | "TANPA_BUKTI"
  | "TANPA_JENIS_BIAYA"
  | "ANGKA_DIUBAH"
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
  if (item.ageDays >= PENDING_STALE_DAYS) f.push("MENGENDAP");
  return f;
}

export const REVIEW_FLAG_MESSAGE: Record<ReviewFlag, string> = {
  TANPA_BUKTI:
    "Tidak ada berkas terlampir — menyetujuinya berarti menyetujui tanpa dasar tertulis.",
  TANPA_JENIS_BIAYA:
    "Belum punya jenis biaya, jadi tidak akan bisa diadu dengan pagu baseline.",
  ANGKA_DIUBAH: "Ada angka yang diubah manusia dari hasil baca struk.",
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
        ageDays: 11,
        fromReceipt: false,
        hasEvidence: true,
        editedFields: [],
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
        ageDays: 6,
        fromReceipt: true,
        hasEvidence: true,
        editedFields: ["amount"],
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
        ageDays: 3,
        fromReceipt: false,
        hasEvidence: false,
        editedFields: [],
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
        ageDays: 2,
        fromReceipt: true,
        hasEvidence: true,
        editedFields: ["vendor", "date"],
      },
    ],
  };
}

export async function loadExpenseReview(): Promise<ExpenseReviewData> {
  return mockExpenseReview();
}
