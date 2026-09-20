"use server";

import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { calculateProjectProfitability } from "@/lib/workflows/project";
import { looksLikeProjectId } from "@/lib/project-command";
import {
  aggregateCostByCategory,
  toPendingRow,
  summarizeCostBoard,
  type CostBoardData,
  type CostSummary,
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
/**
 * Ringkasan Baseline / Aktual / Terikat saja.
 *
 * Jalur ringan untuk pemanggil yang tidak butuh rincian per jenis biaya
 * maupun antrean persetujuan: ia melewatkan dua kueri baris yang paling
 * besar. getProjectCostBoard() memakai fungsi yang sama untuk bagian
 * ringkasannya, jadi keduanya tidak bisa berselisih.
 */
export async function getProjectCostSummary(
  projectId: string,
): Promise<CostSummary | null> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  if (!looksLikeProjectId(projectId)) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      budget: true,
      quotation: { select: { costingSheet: { select: { number: true } } } },
    },
  });
  if (!project) return null;

  const profitability = await calculateProjectProfitability(projectId);

  return summarizeCostBoard({
    baseline: Number(project.budget),
    actual: profitability.actualCost,
    committed: profitability.committedCost,
    pending: profitability.pendingCost,
    payable: profitability.payable,
    baselineSource: project.quotation?.costingSheet?.number ?? null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Antrean biaya yang menunggu keputusan untuk satu proyek.
 *
 * Jalur tersendiri, bukan sekadar bagian papan, karena inilah satu-satunya
 * angka di papan yang BISA DITINDAK langsung: selama baris-baris ini belum
 * diputuskan, posisi biaya proyek belum bisa dibaca utuh. Finance yang
 * membuka daftar tinjauan tidak perlu ikut memuat rincian per jenis biaya.
 *
 * Yang dikembalikan hanya DRAFT dan SUBMITTED. REJECTED sudah diputuskan,
 * dan APPROVED sudah menjadi biaya — keduanya bukan lagi antrean.
 */
export async function getProjectPendingExpenses(
  projectId: string,
): Promise<PendingExpenseRow[] | null> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  if (!looksLikeProjectId(projectId)) return null;

  const exists = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) return null;

  const rows = await prisma.projectExpense.findMany({
    where: {
      projectId,
      deletedAt: null,
      approvalStatus: { in: ["DRAFT", "SUBMITTED"] },
    },
    // Yang paling lama menunggu lebih dulu. Antrean persetujuan yang
    // diurutkan menurut tanggal transaksi akan menyembunyikan justru baris
    // yang paling perlu ditegur.
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      description: true,
      category: true,
      total: true,
      approvalStatus: true,
      submittedAt: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      submittedBy: { select: { name: true } },
    },
  });

  // Dibungkus, bukan .map(toPendingRow): map menyuntikkan index sebagai
  // argumen kedua, yang di sini adalah parameter "now".
  return rows.map((e) => toPendingRow(e));
}

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

  // Pemetaan barisnya dibagi dengan getProjectPendingExpenses() supaya papan
  // dan antrean tinjauan tidak bisa menampilkan nama pengaju atau umur yang
  // berbeda untuk baris yang sama.
  const pendingRows: PendingExpenseRow[] = expenses
    .filter(
      (e) => e.approvalStatus === "DRAFT" || e.approvalStatus === "SUBMITTED",
    )
    .map((e) => toPendingRow(e))
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    projectId: project.id,
    projectName: project.name,
    // Bagian ringkasan dibangun fungsi yang sama dengan
    // getProjectCostSummary(), jadi papan dan jalur ringan tidak bisa
    // menampilkan angka berbeda untuk proyek yang sama.
    summary: summarizeCostBoard({
      baseline: Number(project.budget),
      actual: profitability.actualCost,
      committed: profitability.committedCost,
      pending: profitability.pendingCost,
      payable: profitability.payable,
      baselineSource: project.quotation?.costingSheet?.number ?? null,
      updatedAt: new Date().toISOString(),
    }),
    categories,
    pendingRows,
    isMock: false,
  };
}
