"use server";

import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { costTypeSchema } from "@/lib/validation/cost-type";
import { runAction, type ActionResult } from "@/lib/action-helpers";

/**
 * Menyimpan satu jenis biaya.
 *
 * Tahap ini SENGAJA belum menulis ke basis data: tabel CostType baru dibuat
 * pada tugas backend. Yang sudah nyata di sini adalah validasinya — form
 * benar-benar menolak kode berformat salah, nama terlalu pendek, dan
 * kelompok yang tidak dikenal.
 *
 * Yang tidak dilakukan: berpura-pura berhasil. Input yang lolos validasi
 * tetap dibalas gagal dengan alasan yang jujur, karena form yang berkata
 * "tersimpan" padahal tidak ada yang tersimpan jauh lebih buruk daripada
 * form yang berkata belum bisa.
 */
export async function saveCostTypeAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    // Jenis biaya menempel pada Bagan Akun, jadi kepemilikannya sama:
    // pengaturan tingkat perusahaan, bukan pekerjaan per proyek.
    requirePermission(actor.role, "settings", "update");

    const data = costTypeSchema.parse(input);

    throw new Error(
      `Validasi lolos untuk "${data.code}", tapi penyimpanan belum tersambung. ` +
        "Tabel jenis biaya dibuat pada tahap backend.",
    );
  });
}

/**
 * Menyalakan atau mematikan satu jenis biaya.
 *
 * Dipisah dari saveCostTypeAction karena keduanya dipakai dengan cara yang
 * berbeda: menyunting adalah pekerjaan sadar di dalam form, sedangkan
 * menonaktifkan dilakukan sambil lalu dari daftar. Memaksa orang membuka
 * form hanya untuk mematikan satu baris akan membuat daftar yang sudah usang
 * dibiarkan begitu saja.
 *
 * Menonaktifkan BUKAN menghapus. Biaya lama tetap memegang jenis ini; yang
 * berubah hanya bahwa ia tidak lagi ditawarkan saat mencatat biaya baru.
 *
 * Seperti saveCostTypeAction, tahap ini belum menulis ke basis data dan
 * mengatakannya apa adanya.
 */
export async function setCostTypeActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "settings", "update");

    if (!id) throw new Error("Jenis biaya tidak dikenal.");

    throw new Error(
      `Permintaan ${isActive ? "mengaktifkan" : "menonaktifkan"} jenis biaya ` +
        "sudah benar, tapi penyimpanan belum tersambung. Tabel jenis biaya " +
        "dibuat pada tahap backend.",
    );
  });
}
