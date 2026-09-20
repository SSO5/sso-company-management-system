"use server";

import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { revalidateProjectCost } from "@/lib/revalidate-project-cost";
import { logActivity } from "@/lib/workflows/audit";
import { prisma } from "@/lib/db";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  SET_BASELINE_MESSAGE,
  validateSetBaseline,
  validateUnlockBaseline,
} from "@/lib/project-baseline";

/**
 * Menetapkan satu costing final sebagai baseline proyek.
 *
 * Yang membuat fungsi ini panjang bukan kerumitan, melainkan tiga hal yang
 * harus benar bersamaan:
 *
 *   1. COSTING-NYA MILIK PROYEK INI. Nomor costing dikirim dari form, dan
 *      nomor bisa diketik siapa saja. Tanpa pemeriksaan ini, baseline sebuah
 *      proyek bisa diambil dari costing proyek lain.
 *   2. ANGKANYA DIBEKUKAN, BUKAN DITAUTKAN. Nomor, revisi, nilai, dan
 *      seluruh barisnya disalin. Costing yang direvisi besok tidak boleh
 *      mengubah baseline yang sudah ditetapkan hari ini — itu justru yang
 *      dicegah seluruh fitur ini.
 *   3. HANYA SATU VERSI YANG BERLAKU. Versi lama dimatikan di transaksi yang
 *      sama, dan basis data menjaganya lewat indeks unik parsial.
 *
 * Baris baseline dibuat dengan costTypeId kosong. Itu disengaja:
 * CostingLineItem tidak punya penunjuk ke jenis biaya, dan menebaknya dari
 * nama barang adalah jenis sihir yang salah diam-diam. Pemetaannya dilakukan
 * sebagai tindakan sadar yang terpisah; sampai itu terjadi, papan biaya jujur
 * menulis "belum dipetakan".
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

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, opportunityId: true, quotationId: true },
    });
    if (!project) throw new Error("Proyek tidak ditemukan.");

    // Costing sebuah proyek adalah costing yang menempel pada peluang atau
    // penawarannya. Nomor saja tidak cukup: nomor dikirim dari form dan bisa
    // diketik siapa saja.
    const costing = await prisma.costingSheet.findFirst({
      where: {
        number: input.costingNumber,
        OR: [
          ...(project.opportunityId
            ? [{ opportunityId: project.opportunityId }]
            : []),
          ...(project.quotationId ? [{ quotationId: project.quotationId }] : []),
        ],
      },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        sections: {
          orderBy: { sortOrder: "asc" },
          select: {
            name: true,
            items: {
              orderBy: { sortOrder: "asc" },
              select: { name: true, costTotal: true },
            },
          },
        },
      },
    });
    if (!costing) {
      throw new Error(
        `Costing ${input.costingNumber} bukan milik proyek ini, atau sudah tidak ada.`,
      );
    }

    const current = await prisma.projectBudgetBaseline.findFirst({
      where: { projectId, isCurrent: true },
      select: {
        id: true,
        version: true,
        costingNumber: true,
        costingRevision: true,
        amount: true,
      },
    });

    const problems = validateSetBaseline({
      costing: {
        number: costing.number,
        revision: costing.revision,
        status: costing.status,
      },
      reason: input.reason,
      current: current
        ? {
            costingNumber: current.costingNumber,
            costingRevision: current.costingRevision,
          }
        : null,
    });
    if (problems.length > 0) {
      throw new Error(problems.map((p) => SET_BASELINE_MESSAGE[p]).join(" "));
    }

    // Baris disalin apa adanya dari costing, termasuk nama seksinya, supaya
    // pagu bisa ditelusuri ke uraian aslinya dan bukan cuma total.
    const lines = costing.sections.flatMap((section) =>
      section.items.map((item) => ({
        label: `${section.name} — ${item.name}`,
        category: "OTHER" as const,
        amount: Number(item.costTotal),
      })),
    );
    if (lines.length === 0) {
      throw new Error(
        `Costing ${costing.number} belum punya baris biaya, jadi belum ada yang bisa dibekukan.`,
      );
    }
    const amount = lines.reduce((t, l) => t + l.amount, 0);

    const saved = await prisma.$transaction(async (tx) => {
      const terakhir = await tx.projectBudgetBaseline.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (terakhir?.version ?? 0) + 1;

      // Versi lama dimatikan lebih dulu. Indeks unik parsial di basis data
      // akan menolak transaksinya kalau urutan ini terbalik — dan itu memang
      // penjaga yang diinginkan.
      await tx.projectBudgetBaseline.updateMany({
        where: { projectId, isCurrent: true },
        data: { isCurrent: false },
      });

      const created = await tx.projectBudgetBaseline.create({
        data: {
          projectId,
          version,
          costingSheetId: costing.id,
          costingNumber: costing.number,
          costingRevision: costing.revision,
          amount,
          reason: input.reason.trim() || null,
          isCurrent: true,
          setById: actor.userId,
          lines: {
            create: lines.map((l, i) => ({ ...l, sortOrder: i })),
          },
        },
        select: { id: true, version: true },
      });

      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "PROJECT_BUDGET_BASELINE",
        entityId: created.id,
        description: `Menetapkan baseline v${created.version} proyek dari costing ${costing.number}${
          costing.revision > 0 ? `.R${costing.revision}` : ""
        }`,
        metadata: {
          versiSebelumnya: current?.version ?? null,
          nilaiSebelumnya: current ? Number(current.amount) : null,
          nilaiBaru: amount,
        },
      });

      return created;
    });

    revalidateProjectCost(projectId);
    return { version: saved.version };
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
