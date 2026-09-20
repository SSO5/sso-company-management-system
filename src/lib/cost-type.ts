import type { ExpenseCategory } from "@prisma/client";

/**
 * Master Jenis Biaya Proyek.
 *
 * Yang dipecahkan daftar ini adalah satu celah nyata: ProjectExpense hanya
 * punya delapan nilai ExpenseCategory bawaan sistem (LABOR, MATERIALS,
 * VENDOR, …), sementara costing final menyebut pekerjaan dengan nama yang
 * jauh lebih rinci. Karena keduanya tidak pernah bertemu, pagu PER JENIS
 * BIAYA tidak bisa dihitung sama sekali — papan biaya sampai sekarang
 * menulis "belum dipetakan" di kolom baseline.
 *
 * Jenis biaya di sini adalah lapisan di antaranya:
 *
 *   CostingLineItem  ->  Jenis Biaya  ->  ExpenseCategory  ->  Bagan Akun
 *                        (dikelola          (enum tetap)       (pembukuan)
 *                         pengguna)
 *
 * Dua hal yang sengaja TIDAK dilakukan daftar ini:
 *   - Ia tidak menggantikan ExpenseCategory. Enum itu dipakai belasan tempat
 *     dan menggantinya bukan pekerjaan satu fitur.
 *   - Ia tidak menghapus apa pun yang sudah terpakai. Lihat `isActive`.
 */

export interface CostType {
  id: string;
  /** Kode pendek yang diketik orang, mis. "MAT-PANEL". */
  code: string;
  name: string;
  description: string | null;
  /** Ember bawaan sistem tempat jenis ini bermuara. */
  category: ExpenseCategory;
  /** Akun pada Bagan Akun; null berarti belum dipetakan. */
  accountCode: string | null;
  accountName: string | null;
  isActive: boolean;
  /**
   * Berapa kali jenis ini sudah dipakai biaya proyek.
   *
   * Ditampilkan karena inilah yang menentukan boleh-tidaknya sebuah jenis
   * dihapus: jenis yang sudah menempel pada biaya lama tidak boleh hilang,
   * hanya boleh dinonaktifkan. Menghapusnya akan membuat biaya lama
   * kehilangan pengelompokannya secara diam-diam.
   */
  usageCount: number;
}

/** Jenis biaya yang boleh dipilih saat mencatat biaya baru. */
export function selectableCostTypes(types: CostType[]): CostType[] {
  return types.filter((t) => t.isActive);
}

/**
 * Boleh dihapus atau tidak.
 *
 * Jenis yang belum pernah dipakai boleh hilang sepenuhnya. Yang sudah
 * menempel pada biaya lama hanya boleh dinonaktifkan — riwayat tidak boleh
 * berubah bentuk hanya karena daftar masternya dirapikan.
 */
export function canDeleteCostType(type: CostType): boolean {
  return type.usageCount === 0;
}

/** Jenis yang belum punya akun, jadi biayanya belum bisa masuk pembukuan. */
export function unmappedCostTypes(types: CostType[]): CostType[] {
  return types.filter((t) => t.isActive && t.accountCode === null);
}

/**
 * Urutan tampil: yang belum dipetakan lebih dulu, lalu menurut kode.
 *
 * Jenis biaya yang belum punya akun adalah pekerjaan yang belum selesai, dan
 * mengurutkannya menurut kode saja akan menguburnya di tengah daftar.
 */
export function sortCostTypes(types: CostType[]): CostType[] {
  return [...types].sort((a, b) => {
    const aBelum = a.isActive && a.accountCode === null;
    const bBelum = b.isActive && b.accountCode === null;
    if (aBelum !== bBelum) return aBelum ? -1 : 1;
    // Yang nonaktif turun ke bawah: ia tidak lagi dipakai sehari-hari.
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.code.localeCompare(b.code, "id");
  });
}

/**
 * Contoh daftar jenis biaya.
 *
 * Tidak lagi dipakai halaman — daftarnya kini dibaca dari tabel CostType —
 * tapi tetap disimpan sebagai data uji: ia memuat keempat keadaan yang harus
 * ditangani layar (aktif, nonaktif, belum dipetakan, belum pernah dipakai).
 */
export function mockCostTypes(): CostType[] {
  return [
    { id: "ct-1", code: "MAT-PANEL", name: "Material panel dan komponen listrik", description: "Panel, busbar, MCCB, kabel daya", category: "MATERIALS", accountCode: "5-101", accountName: "Beban Material Proyek", isActive: true, usageCount: 14 },
    { id: "ct-2", code: "MAT-UMUM", name: "Material pendukung", description: null, category: "MATERIALS", accountCode: "5-101", accountName: "Beban Material Proyek", isActive: true, usageCount: 6 },
    { id: "ct-3", code: "UPAH-BORONG", name: "Upah borongan instalasi", description: "Dibayar per paket pekerjaan, bukan harian", category: "LABOR", accountCode: "5-201", accountName: "Beban Tenaga Kerja Proyek", isActive: true, usageCount: 9 },
    { id: "ct-4", code: "UPAH-HARIAN", name: "Upah harian teknisi", description: null, category: "LABOR", accountCode: "5-201", accountName: "Beban Tenaga Kerja Proyek", isActive: true, usageCount: 3 },
    { id: "ct-5", code: "SEWA-ALAT", name: "Sewa alat berat dan genset", description: "Forklift, genset, scaffolding", category: "EQUIPMENT", accountCode: null, accountName: null, isActive: true, usageCount: 5 },
    { id: "ct-6", code: "JASA-VENDOR", name: "Jasa subkontraktor", description: null, category: "VENDOR", accountCode: "5-301", accountName: "Beban Jasa Pihak Ketiga", isActive: true, usageCount: 7 },
    { id: "ct-7", code: "MOB-SITE", name: "Mobilisasi dan transportasi", description: null, category: "TRANSPORTATION", accountCode: null, accountName: null, isActive: true, usageCount: 11 },
    { id: "ct-8", code: "AKOM-SITE", name: "Akomodasi tim di lokasi", description: null, category: "ACCOMMODATION", accountCode: "5-401", accountName: "Beban Perjalanan Dinas", isActive: true, usageCount: 4 },
    { id: "ct-9", code: "LAIN-LAIN", name: "Biaya operasional lain", description: "Hanya dipakai kalau tidak ada yang cocok", category: "OTHER", accountCode: "5-901", accountName: "Beban Lain-lain Proyek", isActive: true, usageCount: 2 },
    { id: "ct-10", code: "GARANSI", name: "Cadangan garansi dan perbaikan", description: "Belum pernah dipakai — masih boleh dihapus", category: "OTHER", accountCode: "5-902", accountName: "Beban Garansi Proyek", isActive: true, usageCount: 0 },
    { id: "ct-11", code: "MAT-LAMA", name: "Material (kode lama)", description: "Diganti MAT-PANEL sejak Agustus 2026", category: "MATERIALS", accountCode: "5-101", accountName: "Beban Material Proyek", isActive: false, usageCount: 21 },
  ];
}

export type CostTypeStatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "UNMAPPED";

export interface CostTypeFilter {
  /** Kata kunci bebas; kosong berarti tidak menyaring. */
  q?: string;
  status?: CostTypeStatusFilter;
}

/**
 * Menyaring daftar jenis biaya.
 *
 * Pencarian menyentuh kode, nama, keterangan, DAN kode akun. Kode akun ikut
 * karena pertanyaan yang sering muncul bukan "mana jenis bernama X" melainkan
 * "jenis apa saja yang masuk ke akun 5-101" — dan tanpa itu orang harus
 * memindai kolom akun satu per satu.
 *
 * Saringan "UNMAPPED" berdiri sendiri, bukan digabung ke status aktif, karena
 * belum dipetakan adalah pekerjaan yang tertunda, bukan keadaan hidup-mati.
 */
export function filterCostTypes(
  types: CostType[],
  filter: CostTypeFilter,
): CostType[] {
  const q = (filter.q ?? "").trim().toLowerCase();
  const status = filter.status ?? "ALL";

  return types.filter((t) => {
    if (status === "ACTIVE" && !t.isActive) return false;
    if (status === "INACTIVE" && t.isActive) return false;
    if (status === "UNMAPPED" && !(t.isActive && t.accountCode === null)) {
      return false;
    }
    if (!q) return true;
    return [t.code, t.name, t.description ?? "", t.accountCode ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

/** Membaca saringan dari query URL, menolak nilai yang tidak dikenal. */
export function parseCostTypeFilter(params: {
  q?: string;
  status?: string;
}): CostTypeFilter {
  const allowed: CostTypeStatusFilter[] = ["ALL", "ACTIVE", "INACTIVE", "UNMAPPED"];
  const status = allowed.find((s) => s === params.status) ?? "ALL";
  return { q: params.q ?? "", status };
}
