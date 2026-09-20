"use server";

import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  CAPTURE_FORM_MESSAGE,
  validateCaptureForm,
  type CaptureFormValues,
} from "@/lib/expense-capture";

/**
 * Menyimpan draf biaya hasil pembacaan struk.
 *
 * Tahap ini SENGAJA belum menulis ke basis data: unggahan dan pembacaannya
 * disambungkan pada tugas backend. Yang sudah nyata adalah pemeriksaannya.
 *
 * Yang tidak dilakukan: berpura-pura berhasil. Formulir yang berkata
 * "draf tersimpan" padahal tidak ada yang tersimpan akan membuat orang
 * membuang struk fisiknya.
 */
export async function saveCaptureDraftAction(
  projectId: string,
  documentId: string | null,
  form: CaptureFormValues,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");

    if (!projectId) throw new Error("Proyek tidak dikenal.");

    const problems = validateCaptureForm(form);
    if (problems.length > 0) {
      throw new Error(problems.map((p) => CAPTURE_FORM_MESSAGE[p]).join(" "));
    }

    throw new Error(
      "Isian sudah benar, tapi penyimpanan draf belum tersambung. " +
        "Unggahan dan pembacaan struk dikerjakan pada tahap backend.",
    );
  });
}
