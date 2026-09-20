"use server";

import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { calculateProjectProfitability } from "@/lib/workflows/project";
import { looksLikeProjectId } from "@/lib/project-command";
import {
  aggregateCostByCategory,
  type CostBoardData,
  type PendingExpenseRow,
} from "@/lib/project-cost-board";

/**
 * Papan Biaya Proyek dari data nyata.
 *
 * Total biaya TIDAK dihitung ulang di sini. Ia datang dari
 * calculateProjectProfitability(), yang memakai summarizeProjectCost() —
 * sumber yang sama dengan halaman detail proyek dan laporan keuangan.
 * aggregateCostByCategory() hanya memecah angka yang sama itu per jenis
 * biaya, dan uji di tests/project-cost-board.test.ts menjaga agar kedua
 * jalur tidak pernah berselisih.
 */
export async function getProjectCostBoard(
  projectId: string,
): Promise<CostBoardData | null> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  if (!looksLikeProjectId(projectId)) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      budget: true,
      quotation: { select: { costingSheet: { select: { number: true } } } },
    },
  });
  if (!project) return null;

  const [profitability, expenses, vendorPos] = await Promise.all([
    calculateProjectProfitability(projectId),
    prisma.projectExpense.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { date: "desc" },
      select: {
        id: true,
        description: true,
        category: true,
        total: true,
        approvalStatus: true,
        paymentStatus: true,
        submittedAt: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        submittedBy: { select: { name: true } },
      },
    }),
    // Hanya PO vendor yang sudah keluar kantor. Yang masih draf belum
    // mengikat apa pun dan tidak boleh muncul sebagai komitmen.
    prisma.vendorPurchaseOrder.findMany({
      where: {
        projectId,
        deletedAt: null,
        status: { in: ["SENT", "CONFIRMED"] },
      },
      select: {
        grandTotal: true,
        expense: { select: { approvalStatus: true, category: true } },
      },
    }),
  ]);

  const categories = aggregateCostByCategory({
    expenses: expenses.map((e) => ({
      category: e.category,
      total: Number(e.total),
      approvalStatus: e.approvalStatus,
      paymentStatus: e.paymentStatus,
    })),
    vendorPos: vendorPos.map((v) => ({
      category: v.expense?.category ?? null,
      grandTotal: Number(v.grandTotal),
      expenseApprovalStatus: v.expense?.approvalStatus ?? null,
    })),
    // Pagu per jenis biaya belum bisa diturunkan: CostingLineItem tidak punya
    // ExpenseCategory. Dibiarkan kosong supaya barisnya jujur berkata "belum
    // dipetakan" daripada terbaca lewat baseline sejak rupiah pertama.
  });

  const now = Date.now();
  const pendingRows: PendingExpenseRow[] = expenses
    .filter(
      (e) => e.approvalStatus === "DRAFT" || e.approvalStatus === "SUBMITTED",
    )
    .map((e) => ({
      id: e.id,
      description: e.description,
      category: e.category,
      amount: Number(e.total),
      approvalStatus: e.approvalStatus as "DRAFT" | "SUBMITTED",
      // Yang mengajukan sebuah draf adalah pembuatnya; submittedBy baru terisi
      // setelah diajukan. Nama yang salah di antrean persetujuan berarti
      // orang yang salah yang ditegur.
      submittedBy: (e.submittedBy ?? e.createdBy).name,
      // Umur dihitung dari saat baris itu MULAI menunggu: tanggal pengajuan
      // untuk yang sudah diajukan, tanggal dibuat untuk yang masih draf.
      ageDays: Math.floor(
        (now - (e.submittedAt ?? e.createdAt).getTime()) / 86_400_000,
      ),
    }));

  return {
    projectId: project.id,
    projectName: project.name,
    baselineSource: project.quotation?.costingSheet?.number ?? null,
    baseline: Number(project.budget),
    actual: profitability.actualCost,
    committed: profitability.committedCost,
    pending: profitability.pendingCost,
    payable: profitability.payable,
    categories,
    pendingRows,
    updatedAt: new Date().toISOString(),
    isMock: false,
  };
}
