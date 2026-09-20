"use server";

import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { validateUnlockBaseline } from "@/lib/project-baseline";

/**
 * Menetapkan satu costing final sebagai baseline proyek.
 *
 * Tahap ini SENGAJA belum menulis ke basis data: tabel baseline dibuat pada
 * tugas backend. Pemeriksaan haknya sudah nyata, dan validasi isiannya
 * dikerjakan validateSetBaseline() yang diuji terpisah.
 *
 * Yang tidak dilakukan: berpura-pura berhasil. Permintaan yang lolos
 * pemeriksaan tetap dibalas gagal dengan alasan yang jujur — panel yang
 * berkata "baseline ditetapkan" padahal tidak ada yang tersimpan jauh lebih
 * berbahaya di sini daripada di tempat lain, karena seluruh gunanya baseline
 * adalah bisa dipercaya.
 */
export async function setProjectBaselineAction(
  projectId: string,
  input: { costingNumber: string; reason: string },
): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");

    if (!input.costingNumber) {
      throw new Error("Pilih dulu costing yang akan dijadikan baseline.");
    }

    throw new Error(
      `Permintaan menetapkan ${input.costingNumber} sebagai baseline sudah benar, ` +
        "tapi penyimpanan belum tersambung. Tabel baseline dibuat pada tahap backend.",
    );
  });
}

/**
 * Mengunci baseline yang sedang berlaku.
 *
 * Mengunci membuat angka lebih sulit digeser, jadi haknya sama dengan hak
 * mengubah proyek. Belum menulis ke basis data pada tahap ini.
 */
export async function lockProjectBaselineAction(
  baselineId: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    if (!baselineId) throw new Error("Baseline tidak dikenal.");

    throw new Error(
      "Permintaan mengunci baseline sudah benar, tapi penyimpanan belum " +
        "tersambung. Tabel baseline dibuat pada tahap backend.",
    );
  });
}

/**
 * Membuka kunci baseline.
 *
 * Hanya ADMIN, dan alasannya wajib. Membuka kunci mengizinkan angka
 * pembanding diubah tanpa meninggalkan versi baru — artinya laporan bulan
 * lalu bisa berubah arti tanpa jejak. Pemeriksaannya dikerjakan
 * validateUnlockBaseline() yang diuji terpisah, lalu diulang di sini karena
 * pemeriksaan di klien saja bukan pemeriksaan.
 */
export async function unlockProjectBaselineAction(
  baselineId: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    if (!baselineId) throw new Error("Baseline tidak dikenal.");

    const problem = validateUnlockBaseline({ role: actor.role, reason });
    if (problem) throw new Error(problem);

    throw new Error(
      "Permintaan membuka kunci sudah benar, tapi penyimpanan belum " +
        "tersambung. Tabel baseline dibuat pada tahap backend.",
    );
  });
}
