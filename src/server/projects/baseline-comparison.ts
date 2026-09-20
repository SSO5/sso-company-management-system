"use server";

import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { looksLikeProjectId } from "@/lib/project-command";
import {
  baselineNotComparable,
  pairBaselineWithActual,
  spendOutsideBaseline,
  type BaselineVsActualRow,
} from "@/lib/project-baseline";

/**
 * Perbandingan Baseline vs Aktual vs Terikat, per jenis biaya.
 *
 * Satu tempat yang menjawab "pagu mana yang sudah habis" untuk seluruh
 * aplikasi. Halaman baseline memakainya, dan papan biaya memakai totalnya
 * sebagai pembanding — supaya keduanya tidak bisa menjawab berbeda.
 *
 * Tiga angka yang dikembalikan terpisah, dan pemisahannya bukan hiasan:
 *
 *   totalBaseline     — pagu yang dibekukan, hanya dari baris yang bisa
 *                       diadu. Baris tanpa jenis biaya TIDAK ikut, karena
 *                       memasukkannya akan membuat sisa pagu terlihat lebih
 *                       besar daripada yang benar-benar terukur.
 *   notComparable     — pagu yang tidak bisa diadu itu, dilaporkan sendiri.
 *   outsideBaseline   — belanja pada jenis biaya yang tidak pernah
 *                       dianggarkan. Karena tidak punya pagu, ia tidak
 *                       pernah muncul sebagai "lewat pagu" di baris mana pun.
 */
export interface BaselineComparison {
  /** null kalau proyek belum punya baseline sama sekali. */
  baselineId: string | null;
  baselineVersion: number | null;
  costingNumber: string | null;
  costingRevision: number;
  /** Nilai baseline utuh, termasuk baris yang belum bisa diadu. */
  baselineAmount: number;
  rows: BaselineVsActualRow[];
  totalBaseline: number;
  totalActual: number;
  totalCommitted: number;
  notComparable: number;
  outsideBaseline: number;
  computedAt: string;
}

export async function getBaselineComparison(
  projectId: string,
): Promise<BaselineComparison | null> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  if (!looksLikeProjectId(projectId)) return null;

  const [baseline, expenses, vendorPos] = await Promise.all([
    prisma.projectBudgetBaseline.findFirst({
      where: { projectId, isCurrent: true },
      select: {
        id: true,
        version: true,
        costingNumber: true,
        costingRevision: true,
        amount: true,
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
    // Aturan yang sama dengan papan biaya: hanya APPROVED yang terpakai.
    prisma.projectExpense.findMany({
      where: {
        projectId,
        deletedAt: null,
        costTypeId: { not: null },
        approvalStatus: "APPROVED",
      },
      select: { total: true, costType: { select: { code: true } } },
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

  const belanja = new Map<string, { actual: number; committed: number }>();
  const baris = (code: string) => {
    let r = belanja.get(code);
    if (!r) {
      r = { actual: 0, committed: 0 };
      belanja.set(code, r);
    }
    return r;
  };

  for (const e of expenses) {
    if (e.costType) baris(e.costType.code).actual += Number(e.total);
  }
  for (const v of vendorPos) {
    // PO vendor yang biayanya sudah disetujui sudah terhitung di atas.
    if (!v.expense?.costType || v.expense.approvalStatus === "APPROVED") continue;
    baris(v.expense.costType.code).committed += Number(v.grandTotal);
  }

  const realisation = [...belanja.entries()].map(([costTypeCode, r]) => ({
    costTypeCode,
    ...r,
  }));

  const rows = pairBaselineWithActual(
    (baseline?.lines ?? []).map((l) => ({
      costTypeCode: l.costType?.code ?? null,
      label: l.label,
      category: l.category,
      amount: Number(l.amount),
    })),
    realisation,
  );

  return {
    baselineId: baseline?.id ?? null,
    baselineVersion: baseline?.version ?? null,
    costingNumber: baseline?.costingNumber ?? null,
    costingRevision: baseline?.costingRevision ?? 0,
    baselineAmount: baseline ? Number(baseline.amount) : 0,
    rows,
    // Hanya baris yang punya pembanding. Memasukkan yang belum dipetakan akan
    // membuat sisa pagu terlihat lebih besar daripada yang benar-benar
    // terukur — dan itu persis kesalahan yang paling sulit terlihat.
    totalBaseline: rows
      .filter((r) => r.gap === null)
      .reduce((t, r) => t + (r.baseline ?? 0), 0),
    totalActual: rows.reduce((t, r) => t + r.actual, 0),
    totalCommitted: rows.reduce((t, r) => t + r.committed, 0),
    notComparable: baselineNotComparable(rows),
    outsideBaseline: spendOutsideBaseline(rows),
    computedAt: new Date().toISOString(),
  };
}
