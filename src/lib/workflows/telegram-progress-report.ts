import { prisma } from "@/lib/db";

/**
 * "Buat progress report dari file" via Telegram — same single-shot shape as
 * telegram-invoice.ts (parse -> simulate -> "ya"/"batal"). The simulate step
 * here is deliberately cheap (no AI read of the attached file yet — that
 * only happens once, on commit, via generateProgressReportForActor, the
 * exact same pipeline the in-app AISSO chat uses): it only needs to resolve
 * the project so the user can confirm they're pointing at the right one
 * before the file gets uploaded and read.
 */
export interface ProgressReportSimulation {
  ok: boolean;
  error?: string;
  projectId?: string;
  projectNumber?: string;
  previewText?: string;
}

export async function simulateProgressReportFromDocument(
  projectNumberRaw: string | null,
  fileName: string
): Promise<ProgressReportSimulation> {
  if (!projectNumberRaw) {
    return {
      ok: false,
      error:
        'Sebutkan nomor project untuk progress report ini di caption filenya, contoh: "Progress report project 001/PRJ/OPS/VIII/2026".',
    };
  }

  const project = await prisma.project.findFirst({
    where: { deletedAt: null, number: { contains: projectNumberRaw, mode: "insensitive" } },
    select: { id: true, number: true, name: true, customer: { select: { companyName: true } } },
  });
  if (!project) {
    return { ok: false, error: `Project "${projectNumberRaw}" tidak ditemukan.` };
  }

  const previewText =
    `*Progress Report — ${project.number}*\n` +
    `${project.name} · ${project.customer.companyName}\n` +
    `File: ${fileName}\n\n` +
    `Akan upload file ini ke folder Progress Report project tersebut, lalu generate checklist progress report standar SSO (termasuk foto asli dari dokumen).\n\n` +
    `Balas "ya" untuk lanjut, atau "batal".`;

  return { ok: true, projectId: project.id, projectNumber: project.number, previewText };
}
