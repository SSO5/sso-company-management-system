import type { UserRole } from "@prisma/client";

/**
 * Isi halaman "Semua Modul" — grid ikon berwarna yang jadi pintu masuk
 * aplikasi.
 *
 * Kenapa ini terpisah dari nav.ts dan bukan dibaca darinya: nav.ts menyusun
 * menu ke dalam GRUP LIPAT (Beranda, Pekerjaan, Keuangan, Laporan,
 * Pengaturan) — bentuk yang tepat untuk daftar tegak yang selalu tampil di
 * sisi kiri. Launcher menyusun hal yang sama ke dalam TAHAP PEKERJAAN, dan
 * hanya memuat modul yang benar-benar sering dibuka. Memaksa satu berkas
 * melayani dua bentuk itu akan membuat keduanya kompromi.
 *
 * Dua aturan yang mengatur berkas ini:
 *
 * 1. URUTAN = URUTAN KERJA. Penjualan dulu, lalu Pelaksanaan, lalu Keuangan.
 *    Orang baru bisa menebak alur perusahaan hanya dari membaca grid ini,
 *    tanpa dijelaskan.
 *
 * 2. WARNA MENGIKUTI TAHAP, BUKAN SELERA. Tiap tahap punya keluarga warna
 *    sendiri — biru untuk Penjualan, hijau untuk Pelaksanaan, oranye untuk
 *    Keuangan, abu-ungu untuk Pendukung. Kalau 20 ikon diberi 20 warna acak,
 *    warnanya cuma hiasan; dikelompokkan begini, posisi dan warna ikon
 *    langsung memberitahu ini pekerjaan tahap mana.
 */
export interface LauncherTile {
  label: string;
  href: string;
  /** Nama ikon lucide, diterjemahkan jadi komponen di app-launcher.tsx. */
  icon: string;
  /** Warna kotak ikon. Teks di atasnya selalu putih. */
  color: string;
  /** Kalimat pendek di bawah label. Menjelaskan isi, bukan mengulangi nama. */
  hint?: string;
  /** Dihilangkan = terlihat semua role. */
  roles?: UserRole[];
}

export interface LauncherSection {
  /** Nomor tahap. Dihilangkan untuk kelompok pendukung yang bukan bagian alur. */
  step?: number;
  label: string;
  /** Satu kalimat: kenapa tahap ini ada. */
  hint: string;
  tiles: LauncherTile[];
}

export const LAUNCHER: LauncherSection[] = [
  {
    step: 1,
    label: "Penjualan",
    hint: "Dari calon pelanggan sampai penawaran dimenangkan",
    tiles: [
      { label: "Pelanggan", href: "/sales/customers", icon: "Users", color: "#2f6fb0", hint: "Perusahaan & kontak", roles: ["ADMIN", "SALES", "VIEWER", "IT"] },
      { label: "Prospek", href: "/sales/opportunities", icon: "Target", color: "#3663ac", hint: "Pipeline penawaran" },
      { label: "Costing", href: "/sales/costing", icon: "Calculator", color: "#4459a6", hint: "Hitung modal & margin" },
      { label: "Penawaran", href: "/sales/quotations", icon: "FileText", color: "#52509f", hint: "Quotation & revisi" },
      { label: "PO & Kontrak", href: "/sales/purchase-orders", icon: "FileCheck", color: "#5f4a97", hint: "Dari pelanggan" },
    ],
  },
  {
    step: 2,
    label: "Pelaksanaan",
    hint: "Dibuat otomatis begitu penawaran ditandai Menang",
    tiles: [
      { label: "Proyek", href: "/projects", icon: "Building2", color: "#17887c", hint: "Progres & profitabilitas" },
      { label: "Tugas", href: "/tasks", icon: "ListChecks", color: "#1d8f6a", hint: "Tugas dari Direktur" },
      { label: "Dokumen Proyek", href: "/projects/folders", icon: "FolderOpen", color: "#2b9459", hint: "Folder per proyek" },
      { label: "Pesanan Vendor", href: "/procurement/vendor-po", icon: "Truck", color: "#56993a", hint: "PO ke pemasok", roles: ["ADMIN", "PROJECT_MANAGER", "VIEWER", "IT"] },
    ],
  },
  {
    step: 3,
    label: "Keuangan",
    hint: "Penagihan mengikuti termin proyek",
    tiles: [
      { label: "Invoice", href: "/finance/invoices", icon: "Receipt", color: "#c2891c", hint: "Tagihan ke pelanggan", roles: ["ADMIN", "FINANCE", "VIEWER", "IT"] },
      { label: "Pembayaran", href: "/finance/payments", icon: "Banknote", color: "#c87d20", hint: "Uang masuk", roles: ["ADMIN", "FINANCE", "VIEWER", "IT"] },
      { label: "Piutang", href: "/finance/receivables", icon: "Clock", color: "#cd7027", hint: "Jatuh tempo & terlambat", roles: ["ADMIN", "FINANCE", "VIEWER", "IT"] },
      { label: "Pengeluaran", href: "/finance/expenses", icon: "Wallet", color: "#d2632e", hint: "Biaya proyek", roles: ["ADMIN", "FINANCE", "VIEWER", "IT"] },
      { label: "Beban Operasional", href: "/finance/company-expenses", icon: "Building", color: "#d65637", hint: "Gaji, sewa, listrik", roles: ["ADMIN", "FINANCE", "VIEWER", "IT"] },
      { label: "Bagan Akun", href: "/settings/chart-of-accounts", icon: "BookOpen", color: "#b8492f", hint: "Chart of account", roles: ["ADMIN", "FINANCE"] },
    ],
  },
  {
    label: "Pendukung",
    hint: "Dipakai di semua tahap",
    tiles: [
      { label: "Beranda", href: "/dashboard", icon: "LayoutDashboard", color: "#5f6b7d", hint: "Ringkasan & tugas saya" },
      { label: "Laporan", href: "/reports/executive", icon: "BarChart3", color: "#7256a4", hint: "Penjualan, profit, proyek" },
      { label: "Pengguna", href: "/settings/users", icon: "UserCog", color: "#85559b", hint: "Akun & hak akses", roles: ["ADMIN"] },
      { label: "Nomor Dokumen", href: "/numbering", icon: "Hash", color: "#556173", hint: "Penomoran otomatis", roles: ["ADMIN", "IT"] },
      { label: "Panduan Sistem", href: "/settings/manual", icon: "LifeBuoy", color: "#4b5668", hint: "Cara pakai aplikasi", roles: ["ADMIN", "IT"] },
      { label: "Log Aktivitas", href: "/activity-log", icon: "History", color: "#424c5c", hint: "Siapa mengubah apa", roles: ["ADMIN", "IT"] },
    ],
  },
];

/**
 * Menyaring ikon yang boleh dilihat sebuah role, lalu membuang bagian yang
 * jadi kosong seluruhnya. Judul tahap tanpa ikon apa pun di bawahnya cuma
 * memberi tahu orang bahwa ada pintu yang tidak boleh ia buka.
 */
export function launcherForRole(role: UserRole): LauncherSection[] {
  return LAUNCHER.map((section) => ({
    ...section,
    tiles: section.tiles.filter((t) => !t.roles || t.roles.includes(role)),
  })).filter((section) => section.tiles.length > 0);
}
