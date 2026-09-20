import { z } from "zod";

/**
 * Aturan satu jenis biaya proyek.
 *
 * Kode ditulis huruf besar dengan angka dan tanda hubung saja, mis.
 * "MAT-PANEL". Alasannya bukan selera: kode ini akan diketik berulang kali
 * saat mencatat biaya dan dibaca berdampingan dengan kode akun, jadi bentuk
 * yang bebas akan melahirkan "mat panel", "Mat-Panel", dan "MATPANEL"
 * sebagai tiga jenis berbeda untuk hal yang sama.
 */
export const COST_TYPE_CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const costTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Kode minimal 2 karakter.")
    .max(24, "Kode maksimal 24 karakter.")
    .transform((v) => v.toUpperCase())
    .refine((v) => COST_TYPE_CODE_PATTERN.test(v), {
      message:
        "Kode hanya boleh huruf, angka, dan tanda hubung — contoh: MAT-PANEL.",
    }),
  name: z.string().trim().min(3, "Nama jenis biaya minimal 3 karakter."),
  description: z
    .string()
    .trim()
    .max(200, "Keterangan maksimal 200 karakter.")
    .optional()
    .nullable()
    // Kolom kosong dan kolom yang tidak diisi sama saja; disimpan sebagai
    // null supaya tidak ada dua bentuk "kosong" di basis data.
    .transform((v) => (v ? v : null)),
  category: z.enum([
    "LABOR",
    "MATERIALS",
    "TRANSPORTATION",
    "ACCOMMODATION",
    "VENDOR",
    "EQUIPMENT",
    "MARKETING",
    "OTHER",
  ]),
  /**
   * Akun pembukuan boleh kosong saat dibuat.
   *
   * Memaksanya diisi sekarang akan membuat orang memilih akun asal-asalan
   * hanya supaya formnya mau tersimpan — dan akun yang salah lebih sulit
   * ditemukan daripada akun yang kosong. Yang kosong ditandai di daftar.
   */
  chartOfAccountId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  isActive: z.coerce.boolean().default(true),
});

export type CostTypeInput = z.infer<typeof costTypeSchema>;
