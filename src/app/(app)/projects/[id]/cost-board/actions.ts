"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { runAction, type ActionResult } from "@/lib/action-helpers";

/**
 * Menyegarkan papan biaya sebuah proyek.
 *
 * Papan ini memang harus berubah begitu ada biaya baru masuk — itu janji
 * fiturnya. Jadi jalurnya dipasang sekarang, selagi datanya masih tiruan,
 * supaya saat kueri aslinya ditulis tidak ada lagi yang perlu dikawatkan:
 * cukup panggil revalidateCostBoard() dari tempat biaya disimpan atau
 * disetujui, dan papan ikut berubah.
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
 * Dipanggil dari alur biaya (simpan draf, ajukan, setujui, tolak, bayar)
 * supaya papan tidak pernah menampilkan angka yang sudah basi.
 *
 * Command Center ikut disegarkan karena ringkasan biayanya membaca sumber
 * yang sama; kalau hanya papan yang disegarkan, dua halaman akan menampilkan
 * angka berbeda untuk proyek yang sama.
 *
 * Wajib async: berkas "use server" hanya boleh mengekspor fungsi async, dan
 * fungsi sinkron di sini akan menggagalkan build.
 */
export async function revalidateCostBoard(projectId: string): Promise<void> {
  revalidatePath(`/projects/${projectId}/cost-board`);
  revalidatePath(`/projects/${projectId}/command`);
}
