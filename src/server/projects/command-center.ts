"use server";

import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { calculateProjectProfitability } from "@/lib/workflows/project";
import {
  computeProjectRiskSignals,
  computeSCurve,
  invoiceOutstanding,
} from "@/lib/workflows/calculations";
import { isIssuedInvoice } from "@/lib/workspace";
import {
  buildProjectCommand,
  looksLikeProjectId,
  type ProjectCommandData,
} from "@/lib/project-command";

/**
 * Ringkasan Project Command Center dari data nyata.
 *
 * Aturan yang dipegang berkas ini:
 *
 *   1. TIDAK ADA rumus baru. Angka biaya datang dari
 *      calculateProjectProfitability() (yang memakai summarizeProjectCost),
 *      dan pesan risiko dari computeProjectRiskSignals(). Kalau layar ini
 *      menghitung sendiri, ia akan berbeda dari laporan cepat atau lambat.
 *   2. Bentuk datanya diputuskan buildProjectCommand() yang murni dan diuji
 *      terpisah. Berkas ini hanya mengambil baris.
 *   3. Proyek yang tidak ada mengembalikan null, bukan melempar. Halaman
 *      memanggil notFound() atasnya.
 */
export async function getProjectCommandSummary(
  projectId: string,
): Promise<ProjectCommandData | null> {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "project", "view");

  // Bentuk id disaring lebih dulu supaya alamat sembarangan tidak menjadi
  // kueri basis data.
  if (!looksLikeProjectId(projectId)) return null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      number: true,
      name: true,
      jobNumber: true,
      status: true,
      startDate: true,
      endDate: true,
      contractValue: true,
      budget: true,
      progressPercent: true,
      customer: { select: { companyName: true } },
      projectManager: { select: { name: true } },
      opportunity: { select: { number: true, status: true } },
      quotation: {
        select: {
          number: true,
          status: true,
          grandTotal: true,
          // CostingSheet menggantung pada Quotation lewat quotationId yang
          // unik, bukan pada Project — jadi inilah satu-satunya jalan ke sana.
          costingSheet: { select: { number: true, status: true } },
        },
      },
      milestones: {
        select: {
          name: true,
          status: true,
          dueDate: true,
          completedAt: true,
          weightPercent: true,
        },
      },
      purchaseOrders: {
        where: { deletedAt: null },
        select: { number: true, poValue: true },
      },
      vendorPurchaseOrders: {
        where: { deletedAt: null },
        select: { number: true, status: true, grandTotal: true },
      },
      _count: {
        select: {
          invoices: { where: { deletedAt: null } },
          progressReports: { where: { deletedAt: null } },
        },
      },
    },
  });

  if (!project) return null;

  const [profitability, documentCount, invoices] = await Promise.all([
    calculateProjectProfitability(projectId),
    prisma.document.count({
      where: { deletedAt: null, folder: { projectId } },
    }),
    // Invoice diambil untuk dua hal sekaligus: kurva S (masukan sinyal
    // penyimpangan jadwal) dan sinyal invoice lewat tempo. Mengambilnya sekali
    // lebih murah daripada dua kueri untuk baris yang sama.
    prisma.invoice.findMany({
      where: { projectId, deletedAt: null },
      select: {
        number: true,
        status: true,
        invoiceDate: true,
        dueDate: true,
        grandTotal: true,
        dpPercent: true,
        paidAmount: true,
        withholdingTax: true,
      },
    }),
  ]);

  const milestones = project.milestones.map((m) => ({
    name: m.name,
    status: m.status,
    dueDate: m.dueDate,
    completedAt: m.completedAt,
    weightPercent: Number(m.weightPercent),
  }));

  const sCurve = computeSCurve({
    milestones: milestones.map((m) => ({
      dueDate: m.dueDate,
      weightPercent: m.weightPercent,
      completedAt: m.completedAt,
    })),
    invoices: invoices.map((i) => ({
      invoiceDate: i.invoiceDate,
      grandTotal: Number(i.grandTotal),
      dpPercent: i.dpPercent ? Number(i.dpPercent) : null,
      status: i.status,
    })),
    contractValue: Number(project.contractValue),
  });

  // Sinyal risiko dihitung dengan masukan yang sama persis seperti di halaman
  // detail proyek, supaya dua halaman tidak pernah memperingatkan hal berbeda
  // tentang proyek yang sama.
  //
  // Bedanya satu, dan disengaja: di sini invoices, contractValue, dan
  // forecastCost ikut dikirim, sehingga sinyal INVOICE_OVERDUE dan
  // MARGIN_EROSION benar-benar menyala. Command Center memang tempatnya —
  // ia dibuka justru untuk bertanya "apa yang menahan proyek ini".
  const riskSignals = computeProjectRiskSignals({
    status: project.status,
    milestones: milestones.map((m) => ({
      name: m.name,
      status: m.status,
      dueDate: m.dueDate,
    })),
    budget: Number(project.budget),
    approvedExpenseTotal: profitability.actualCost,
    sCurveAsOfToday: sCurve.asOfToday,
    // Sisa tagihan dihitung invoiceOutstanding(), helper yang sama dipakai
    // summarizeIssuedInvoices(). Menuliskan ulang aturan DP dan PPh di sini
    // adalah cara termudah membuat dua halaman menampilkan piutang berbeda.
    invoices: invoices
      .filter((i) => isIssuedInvoice(i.status))
      .map((i) => ({
        number: i.number,
        dueDate: i.dueDate,
        status: i.status,
        outstanding: Math.max(0, invoiceOutstanding(i)),
      })),
    contractValue: Number(project.contractValue),
    forecastCost: profitability.forecastCost,
  });

  return buildProjectCommand({
    project: {
      id: project.id,
      number: project.number,
      name: project.name,
      jobNumber: project.jobNumber,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      contractValue: Number(project.contractValue),
      budget: Number(project.budget),
      progressPercent: project.progressPercent,
      customerName: project.customer.companyName,
      projectManagerName: project.projectManager?.name ?? null,
    },
    milestones,
    cost: {
      actualCost: profitability.actualCost,
      committedCost: profitability.committedCost,
      pendingCost: profitability.pendingCost,
      forecastCost: profitability.forecastCost,
    },
    opportunity: project.opportunity
      ? { number: project.opportunity.number, status: project.opportunity.status }
      : null,
    costing: project.quotation?.costingSheet
      ? {
          number: project.quotation.costingSheet.number,
          status: project.quotation.costingSheet.status,
        }
      : null,
    quotation: project.quotation
      ? {
          number: project.quotation.number,
          status: project.quotation.status,
          grandTotal: Number(project.quotation.grandTotal),
        }
      : null,
    customerPurchaseOrders: project.purchaseOrders.map((p) => ({
      number: p.number,
      poValue: Number(p.poValue),
    })),
    vendorPurchaseOrders: project.vendorPurchaseOrders.map((v) => ({
      number: v.number,
      status: v.status,
      grandTotal: Number(v.grandTotal),
    })),
    billing: {
      totalInvoiced: profitability.totalInvoiced,
      totalPaid: profitability.totalPaid,
      invoiceCount: project._count.invoices,
    },
    documentCount,
    riskMessages: riskSignals.map((s) => s.message),
    weeklyReportCount: project._count.progressReports,
    now: new Date(),
  });
}
