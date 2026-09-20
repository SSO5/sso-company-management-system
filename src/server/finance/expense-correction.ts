"use server";

import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requireExpenseApprover } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import type { CorrectionValues } from "@/lib/expense-review";

/**
 * Menyimpan koreksi atas draf biaya yang sudah diajukan.
 *
 * Tahap ini SENGAJA belum menulis ke basis data, dan ada satu hal yang harus
 * diputuskan pemilik sistem sebelum bisa ditulis:
 *
 *   submitExpenseForApproval() mengunci biaya (isLocked: true) begitu
 *   diajukan, dan kunci itu baru dibuka saat DITOLAK. Artinya aturan yang
 *   berlaku sekarang berkata biaya yang sudah diajukan TIDAK boleh diubah —
 *   yang bisa dilakukan hanyalah menolaknya supaya pengajunya memperbaiki
 *   sendiri.
 *
 *   PRD meminta "koreksi sebelum setujui". Keduanya sah, tapi tidak bisa
 *   dua-duanya: entah kuncinya dilonggarkan untuk Admin, atau koreksi
 *   memang dijalankan lewat penolakan. Menuliskan salah satunya diam-diam di
 *   sini akan mengubah aturan persetujuan tanpa ada yang memutuskan.
 *
 * Pemeriksaan haknya sudah nyata: yang boleh mengoreksi sama dengan yang
 * boleh memutuskan.
 */
export async function saveExpenseCorrectionAction(
  expenseId: string,
  submittedById: string,
  _values: CorrectionValues,
  note: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requireExpenseApprover(actor.role, actor.userId, submittedById);

    if (!expenseId) throw new Error("Biaya tidak dikenal.");
    if (!note.trim()) throw new Error("Tulis catatan koreksi.");

    throw new Error(
      "Koreksinya sudah benar, tapi penyimpanan belum tersambung. Biaya yang " +
        "sudah diajukan saat ini dikunci sampai ditolak — apakah kunci itu " +
        "dilonggarkan untuk Admin, atau koreksi dijalankan lewat penolakan, " +
        "perlu diputuskan lebih dulu.",
    );
  });
}
