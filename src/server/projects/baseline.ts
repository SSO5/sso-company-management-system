"use server";

import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { revalidateProjectCost } from "@/lib/revalidate-project-cost";
import { logActivity } from "@/lib/workflows/audit";
import { prisma } from "@/lib/db";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { looksLikeProjectId } from "@/lib/project-command";
import {
  SET_BASELINE_MESSAGE,
  type BaselineVersion,
  type ProjectBaselineData,
  validateSetBaseline,
  validateUnlockBaseline,
} from "@/lib/project-baseline";

/**
 * Membaca budget baseline sebuah proyek: versi yang berlaku, seluruh
 * riwayatnya, costing yang tersedia, dan realisasi per jenis biaya.
 *
 * Realisasi dihitung dengan aturan yang sama persis dengan papan biaya —
 * hanya biaya APPROVED yang menjadi terpakai, dan PO vendor yang biayanya
 * belum disetujui menjadi terikat. Kalau halaman ini menghitungnya sendiri
 * dengan cara lain, dua layar akan menampilkan realisasi berbeda untuk
 * proyek yang sama dan tidak akan ada yang tahu mana yang benar.
 */
export async function getProjectBaseline(
  projectId: string,
): Promise<ProjectBaselineData | null> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  if (!looksLikeProjectId(projectId)) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      budget: true,
      opportunityId: true,
      quotationId: true,
    },
  });
  if (!project) return null;

  const [baselines, costings, expenses, vendorPos] = await Promise.all([
    prisma.projectBudgetBaseline.findMany({
      where: { projectId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        costingSheetId: true,
        costingNumber: true,
        costingRevision: true,
        amount: true,
        reason: true,
        isCurrent: true,
        setAt: true,
        setBy: { select: { name: true } },
        lockedAt: true,
        lockedBy: { select: { name: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          select: {
            label: true,
            category: true,
            amount: true,
            costType: { select: { code: true } },
          },
        },
      },
    }),
    // Costing proyek ini adalah costing yang menempel pada peluang atau
    // penawarannya — sama dengan aturan di setProjectBaselineAction.
    prisma.costingSheet.findMany({
      where: {
        OR: [
          ...(project.opportunityId
            ? [{ opportunityId: project.opportunityId }]
            : []),
          ...(project.quotationId ? [{ quotationId: project.quotationId }] : []),
        ],
      },
      orderBy: { costingDate: "desc" },
      select: {
        number: true,
        revision: true,
        status: true,
        sections: { select: { items: { select: { costTotal: true } } } },
      },
    }),
    prisma.projectExpense.findMany({
      where: { projectId, deletedAt: null, costTypeId: { not: null } },
      select: {
        total: true,
        approvalStatus: true,
        costType: { select: { code: true } },
      },
    }),
    prisma.vendorPurchaseOrder.findMany({
      where: {
        projectId,
        deletedAt: null,
        status: { in: ["SENT", "CONFIRMED"] },
      },
      select: {
        grandTotal: true,
        expense: {
          select: { approvalStatus: true, costType: { select: { code: true } } },
        },
      },
    }),
  ]);

  const realisasi = new Map<string, { actual: number; committed: number }>();
  const baris = (code: string) => {
    let r = realisasi.get(code);
    if (!r) {
      r = { actual: 0, committed: 0 };
      realisasi.set(code, r);
    }
    return r;
  };
  for (const e of expenses) {
    if (!e.costType) continue;
    // Hanya APPROVED yang menjadi terpakai. Yang menunggu belum diputuskan,
    // dan yang ditolak tidak pernah terjadi.
    if (e.approvalStatus === "APPROVED") {
      baris(e.costType.code).actual += Number(e.total);
    }
  }
  for (const v of vendorPos) {
    // PO vendor yang biayanya sudah disetujui sudah terhitung lewat barisnya
    // sendiri di atas; menghitungnya lagi akan menggandakannya.
    if (!v.expense?.costType || v.expense.approvalStatus === "APPROVED") continue;
    baris(v.expense.costType.code).committed += Number(v.grandTotal);
  }

  const currentId = baselines.find((b) => b.isCurrent)?.id ?? null;

  const versions: BaselineVersion[] = baselines.map((b) => ({
    id: b.id,
    version: b.version,
    costingId: b.costingSheetId,
    costingNumber: b.costingNumber,
    costingRevision: b.costingRevision,
    amount: Number(b.amount),
    setAt: b.setAt.toISOString(),
    setBy: b.setBy.name,
    reason: b.reason,
    lockedAt: b.lockedAt?.toISOString() ?? null,
    lockedBy: b.lockedBy?.name ?? null,
    lines: b.lines.map((l) => ({
      costTypeCode: l.costType?.code ?? null,
      label: l.label,
      category: l.category,
      amount: Number(l.amount),
    })),
  }));

  return {
    projectId: project.id,
    projectName: project.name,
    projectBudget: Number(project.budget),
    current: versions.find((v) => v.id === currentId) ?? null,
    history: versions,
    realisation: [...realisasi.entries()].map(([costTypeCode, r]) => ({
      costTypeCode,
      ...r,
    })),
    realisationAt: new Date().toISOString(),
    availableCostings: costings.map((c) => ({
      number: c.number,
      revision: c.revision,
      status: c.status,
      amount: c.sections.reduce(
        (t, sec) => t + sec.items.reduce((u, i) => u + Number(i.costTotal), 0),
        0,
      ),
    })),
    isMock: false,
  };
}

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
