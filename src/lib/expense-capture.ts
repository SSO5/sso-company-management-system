/**
 * Smart Expense Capture — unggah struk, jadikan draf biaya.
 *
 * Yang dikerjakan fitur ini bukan "membaca struk dengan AI", melainkan
 * memperpendek jarak antara selembar struk di tangan orang lapangan dan satu
 * baris biaya yang bisa disetujui finance. Pembacaan otomatis hanya mengisi
 * formulir; keputusannya tetap manusia.
 *
 * Tiga aturan yang dipegang berkas ini:
 *
 *   1. BERKASNYA SELALU TERSIMPAN, walau pembacaannya gagal. Struk adalah
 *      bukti; kehilangan bukti karena mesin tidak bisa membacanya adalah
 *      kerugian yang jauh lebih besar daripada harus mengetik ulang.
 *   2. HASIL BACA ADALAH USULAN, BUKAN FAKTA. Setiap angka yang ditawarkan
 *      harus bisa diubah, dan yang mencurigakan ditandai — bukan diam-diam
 *      dipercaya.
 *   3. DRAF, BUKAN BIAYA. Apa pun hasilnya, yang terbentuk adalah
 *      ProjectExpense berstatus DRAFT yang wajib melewati finance.
 */

export interface ReceiptItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** Nilai baris menurut struk, bukan hasil perkalian kita. */
  total: number;
}

export interface ExtractedReceipt {
  vendor: string | null;
  /** Tanggal pada struk, ISO. null kalau tidak terbaca. */
  date: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  /** Total yang tercetak di struk. */
  total: number | null;
}

export interface ExpenseCaptureDraft {
  projectId: string;
  projectName: string;
  /** Dokumen yang sudah tersimpan, apa pun hasil pembacaannya. */
  documentId: string | null;
  fileName: string | null;
  extracted: ExtractedReceipt | null;
  /** Alasan pembacaan gagal; berkasnya tetap tersimpan. */
  extractionError: string | null;
  /** Nama vendor yang pernah dipakai di proyek ini, untuk saran ketik. */
  vendorHistory: string[];
  costTypes: { id: string; code: string; name: string }[];
  isMock: boolean;
}

/** Jumlah seluruh baris menurut nilai yang tercetak per baris. */
export function sumItems(items: ReceiptItem[]): number {
  return items.reduce((t, i) => t + i.total, 0);
}

/** Selisih antara perkalian qty x harga dan nilai baris yang tercetak. */
export function lineDrift(item: ReceiptItem): number {
  return item.total - item.quantity * item.unitPrice;
}

export type CaptureWarning =
  | "TOTAL_TIDAK_COCOK"
  | "BARIS_TIDAK_KONSISTEN"
  | "VENDOR_KOSONG"
  | "TANGGAL_KOSONG"
  | "TIDAK_ADA_BARIS"
  | "TOTAL_KOSONG";

/** Rupiah selisih yang masih dianggap pembulatan, bukan salah baca. */
export const RECONCILE_TOLERANCE = 1;

/**
 * Memeriksa hasil pembacaan sebelum ditawarkan ke orang.
 *
 * Pemeriksaan terpenting ada di sini: JUMLAH BARIS versus TOTAL YANG
 * TERCETAK. Pembacaan otomatis jarang gagal total — yang sering terjadi
 * adalah satu baris terlewat atau satu angka salah digit, dan hasilnya tetap
 * terlihat masuk akal. Mengadu dua angka yang seharusnya sama adalah cara
 * paling murah menangkapnya, dan satu-satunya yang tidak menuntut orang
 * memeriksa struk baris demi baris.
 *
 * Yang TIDAK dilakukan: menolak drafnya. Struk yang ganjil tetap boleh
 * disimpan sebagai draf — finance yang memutuskan. Peringatan ini menentukan
 * apa yang harus dilihat orang, bukan apa yang boleh dia lakukan.
 */
export function captureWarnings(
  extracted: ExtractedReceipt | null,
): CaptureWarning[] {
  if (!extracted) return [];
  const w: CaptureWarning[] = [];

  if (!extracted.vendor) w.push("VENDOR_KOSONG");
  if (!extracted.date) w.push("TANGGAL_KOSONG");
  if (extracted.items.length === 0) w.push("TIDAK_ADA_BARIS");
  if (extracted.total === null) w.push("TOTAL_KOSONG");

  if (extracted.items.some((i) => Math.abs(lineDrift(i)) > RECONCILE_TOLERANCE)) {
    w.push("BARIS_TIDAK_KONSISTEN");
  }

  if (extracted.total !== null && extracted.items.length > 0) {
    const dihitung = sumItems(extracted.items) + (extracted.tax ?? 0);
    if (Math.abs(dihitung - extracted.total) > RECONCILE_TOLERANCE) {
      w.push("TOTAL_TIDAK_COCOK");
    }
  }

  return w;
}

export const CAPTURE_WARNING_MESSAGE: Record<CaptureWarning, string> = {
  TOTAL_TIDAK_COCOK:
    "Jumlah baris ditambah pajak tidak sama dengan total yang tercetak. Biasanya ada satu baris terlewat atau satu angka salah baca.",
  BARIS_TIDAK_KONSISTEN:
    "Ada baris yang nilainya tidak sama dengan jumlah kali harga satuan. Periksa baris bertanda.",
  VENDOR_KOSONG: "Nama vendor tidak terbaca — isi manual sebelum menyimpan.",
  TANGGAL_KOSONG: "Tanggal struk tidak terbaca — isi manual sebelum menyimpan.",
  TIDAK_ADA_BARIS:
    "Tidak ada rincian barang yang terbaca. Draf tetap bisa disimpan dengan satu nilai total.",
  TOTAL_KOSONG: "Total tidak terbaca — isi manual sebelum menyimpan.",
};

/**
 * Nilai yang diusulkan untuk draf biaya.
 *
 * Total yang tercetak selalu menang kalau ada: itulah yang benar-benar
 * dibayar. Jumlah baris hanya dipakai kalau totalnya tidak terbaca, dan
 * kalau keduanya kosong, nol — supaya orang mengisinya sendiri, bukan
 * menerima angka karangan.
 */
export function suggestedAmount(extracted: ExtractedReceipt | null): number {
  if (!extracted) return 0;
  if (extracted.total !== null) return extracted.total;
  if (extracted.items.length > 0) return sumItems(extracted.items);
  return 0;
}

/** Saran vendor dari riwayat, disaring dari yang sedang diketik. */
export function suggestVendors(history: string[], typed: string): string[] {
  const q = typed.trim().toLowerCase();
  const unik = [...new Set(history.map((v) => v.trim()).filter(Boolean))];
  if (!q) return unik.slice(0, 8);
  return unik.filter((v) => v.toLowerCase().includes(q)).slice(0, 8);
}

/** Data tiruan: sengaja memuat struk yang totalnya TIDAK cocok. */
export function mockExpenseCapture(projectId: string): ExpenseCaptureDraft {
  return {
    projectId,
    projectName: "Pengadaan dan Instalasi Panel Listrik — Site Cilegon",
    documentId: "doc-struk-1",
    fileName: "struk-toko-sinar-jaya-19092026.jpg",
    extracted: {
      vendor: "Toko Sinar Jaya",
      date: "2026-09-19",
      items: [
        { description: "Kabel NYY 4x25mm", quantity: 3, unit: "roll", unitPrice: 2_450_000, total: 7_350_000 },
        { description: "Skun kabel 25mm", quantity: 40, unit: "pcs", unitPrice: 12_500, total: 500_000 },
        // Baris ini sengaja tidak konsisten: 6 x 185.000 = 1.110.000,
        // bukan 1.210.000. Persis bentuk salah baca yang paling sering
        // terjadi dan paling mudah lolos kalau tidak diadu.
        { description: "Isolasi 3M tebal", quantity: 6, unit: "pcs", unitPrice: 185_000, total: 1_210_000 },
      ],
      subtotal: 9_060_000,
      tax: 996_600,
      total: 9_956_600,
    },
    extractionError: null,
    vendorHistory: [
      "Toko Sinar Jaya",
      "CV Elektrindo Perkasa",
      "PT Kabel Metal Indonesia",
      "Toko Bangunan Makmur",
    ],
    costTypes: [
      { id: "ct-1", code: "MAT-PANEL", name: "Material panel dan komponen listrik" },
      { id: "ct-3", code: "UPAH-BORONG", name: "Upah borongan instalasi" },
      { id: "ct-5", code: "SEWA-ALAT", name: "Sewa alat berat dan genset" },
      { id: "ct-7", code: "MOB-SITE", name: "Mobilisasi dan transportasi" },
    ],
    isMock: true,
  };
}

export async function loadExpenseCapture(
  projectId: string,
): Promise<ExpenseCaptureDraft | null> {
  const { looksLikeProjectId } = await import("./project-command");
  if (!looksLikeProjectId(projectId)) return null;
  return mockExpenseCapture(projectId);
}

/* ------------------------------------------------------------------ *
 * Pemeriksaan berkas struk sebelum diunggah
 * ------------------------------------------------------------------ */

/**
 * Jenis berkas yang masuk akal untuk sebuah struk.
 *
 * Lebih sempit daripada ALLOWED_EXTENSIONS di storage.ts, dan itu disengaja:
 * daftar lebar di sana melayani seluruh dokumen proyek, sementara di sini
 * menawarkan .xlsx atau .zip hanya akan membuat orang mengunggah berkas yang
 * pasti tidak bisa dibaca sebagai struk.
 */
export const RECEIPT_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];

export const RECEIPT_ACCEPT = RECEIPT_EXTENSIONS.map((e) => `.${e}`).join(",");

/**
 * Batas ukuran unggahan struk.
 *
 * Bukan 50MB seperti batas penyimpanan, melainkan 20MB — di bawah
 * serverActions.bodySizeLimit (25MB) di next.config.mjs, karena berkas naik
 * lewat badan permintaan Server Action. Menolaknya di browser jauh lebih
 * baik daripada membiarkan orang menunggu unggahan besar lalu gagal di
 * server dengan galat yang tidak menyebut ukuran.
 */
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;

export type ReceiptFileProblem =
  | "JENIS_TIDAK_DIDUKUNG"
  | "TERLALU_BESAR"
  | "KOSONG";

export function receiptFileProblem(file: {
  name: string;
  size: number;
}): ReceiptFileProblem | null {
  if (file.size === 0) return "KOSONG";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!RECEIPT_EXTENSIONS.includes(ext)) return "JENIS_TIDAK_DIDUKUNG";
  if (file.size > MAX_RECEIPT_BYTES) return "TERLALU_BESAR";
  return null;
}

export const RECEIPT_FILE_MESSAGE: Record<ReceiptFileProblem, string> = {
  JENIS_TIDAK_DIDUKUNG: `Hanya foto (${RECEIPT_EXTENSIONS.filter((e) => e !== "pdf").join(", ")}) atau PDF yang bisa dibaca sebagai struk.`,
  TERLALU_BESAR: `Berkas lebih dari ${Math.round(MAX_RECEIPT_BYTES / 1024 / 1024)}MB. Foto dari kamera ponsel biasanya jauh di bawah itu — coba kirim ulang tanpa diperbesar.`,
  KOSONG: "Berkasnya kosong. Coba ambil ulang fotonya.",
};

/** Ukuran berkas dalam satuan yang bisa dibaca orang. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Benar kalau berkasnya bisa ditampilkan sebagai gambar di browser. */
export function isPreviewableImage(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  // HEIC tidak dirender browser mana pun tanpa konversi, jadi ia sengaja
  // TIDAK dianggap bisa dipratinjau walau boleh diunggah.
  return ["jpg", "jpeg", "png", "webp"].includes(ext);
}
