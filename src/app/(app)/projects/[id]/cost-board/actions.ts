"use server";

import { revalidateProjectCost } from "@/lib/revalidate-project-cost";
import { requireUser } from "@/lib/auth/current-user";
import { runAction, type ActionResult } from "@/lib/action-helpers";

/**
 * Menyegarkan papan biaya sebuah proyek.
 *
 * Dipakai tombol "Perbarui" di papan. Penyegaran otomatis saat biaya berubah
 * sudah ditangani revalidateProjectCost() dari alur biayanya masing-masing;
 * tombol ini untuk keadaan yang tidak terlihat server, misalnya tab yang
 * lama ditinggal.
 *
 * Tidak ada mutasi di sini. Fungsi ini hanya membuang cache halaman.
 */
export async function refreshCostBoardAction(
  projectId: string,
): Promise<ActionResult<{ refreshedAt: string }>> {
  return runAction(async () => {
    await requireUser();
    await revalidateCostBoard(projectId);
    return { refreshedAt: new Date().toISOString() };
  });
}

/**
 * Membuang cache papan biaya proyek ini.
 *
 * Hanya membungkus revalidateProjectCost() supaya bisa dipanggil sebagai
 * server action dari tombol Perbarui. Daftar halaman yang disegarkan hidup
 * di satu tempat, bukan disalin dua kali.
 */
export async function revalidateCostBoard(projectId: string): Promise<void> {
  revalidateProjectCost(projectId);
}
