"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requireDataCorrector, requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  correctDocumentNumber,
  correctProgressReportDetails,
  renameDocumentFile,
  relocateDocument,
  correctOpportunityStage,
  reassignProjectCustomer,
  archiveWonArtifacts,
  revertContractToDraft,
  revertMilestoneToPending,
  attachPaymentEvidence,
} from "@/lib/workflows/corrections";

/**
 * Server actions for the "Koreksi Dokumen" panel (Settings, ADMIN/IT only —
 * see nav.ts). Every mutation here goes through lib/workflows/corrections.ts,
 * which is the only place allowed to edit a document's number/name/filing
 * after it's no longer in DRAFT state. This file is just the list+dispatch
 * layer the UI talks to.
 */

async function assertCorrector() {
  const actor = await requireUserOrThrow();
  requireDataCorrector(actor.role);
  return actor;
}

export async function listQuotationsForCorrection() {
  await assertCorrector();
  return prisma.quotation.findMany({
    where: { deletedAt: null },
    select: {
      id: true, number: true, revision: true, status: true, quotationDate: true,
      customer: { select: { companyName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listVendorPOsForCorrection() {
  await assertCorrector();
  return prisma.vendorPurchaseOrder.findMany({
    select: {
      id: true, number: true, status: true, poDate: true, vendorName: true,
      project: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listInvoicesForCorrection() {
  await assertCorrector();
  return prisma.invoice.findMany({
    select: {
      id: true, number: true, status: true, invoiceDate: true,
      customer: { select: { companyName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listProgressReportsForCorrection() {
  await assertCorrector();
  return prisma.progressReport.findMany({
    select: {
      id: true, number: true, title: true, reportKind: true, inspectionDate: true,
      project: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Deals the "Status Deal" correction tab lets ADMIN/IT search through:
 * either currently stuck WON/LOST, OR already reverted but still carrying a
 * stray WON Quotation + live Project from before the revert (the two
 * corrections — stage vs. artifacts — can happen at different times, see
 * archiveWonArtifacts). Not every Opportunity, so this stays a focused
 * correction list, not a general deal editor.
 */
export async function listWonLostOpportunitiesForCorrection() {
  await assertCorrector();
  const rows = await prisma.opportunity.findMany({
    where: {
      deletedAt: null,
      OR: [
        { status: { in: ["WON", "LOST"] } },
        { quotations: { some: { status: "WON", deletedAt: null, project: { deletedAt: null } } } },
        // Already reverted (stage + quotation + Project all corrected) but
        // possibly by a run of archiveWonArtifacts that predates folder
        // restoration — still worth surfacing so "Arsipkan Project &
        // Kembalikan Quotation" can be re-run to fix just the folders.
        { AND: [{ status: { notIn: ["WON", "LOST"] } }, { projects: { some: {} } }] },
      ],
    },
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      updatedAt: true,
      customer: { select: { companyName: true } },
      quotations: {
        where: { deletedAt: null },
        select: { id: true, number: true, revision: true, status: true, grandTotal: true },
        orderBy: { createdAt: "asc" },
      },
      costingSheets: {
        where: { deletedAt: null },
        select: { id: true, number: true, revision: true, status: true, quotationId: true },
        orderBy: { createdAt: "asc" },
      },
      projects: { where: { deletedAt: null }, select: { id: true, number: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  // Decimal (grandTotal) and Date (updatedAt) don't survive the client-component boundary as-is.
  return JSON.parse(JSON.stringify(rows)) as Array<Omit<(typeof rows)[number], "quotations" | "updatedAt"> & {
    updatedAt: string;
    quotations: Array<Omit<(typeof rows)[number]["quotations"][number], "grandTotal"> & { grandTotal: string }>;
  }>;
}

/** Project picker for the "Ganti Pelanggan Project" correction tab. */
export async function listProjectsForCorrection() {
  await assertCorrector();
  return prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, number: true, name: true, customer: { select: { companyName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Customer picker to reassign a Project to — includes companyName only, alphabetized. */
export async function listCustomersForCorrection() {
  await assertCorrector();
  return prisma.customer.findMany({
    where: { deletedAt: null },
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
  });
}

export async function reassignProjectCustomerAction(
  projectId: string,
  newCustomerId: string,
  reason: string
): Promise<ActionResult<{ id: string; number: string; oldCustomerName: string; newCustomerName: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await reassignProjectCustomer(projectId, newCustomerId, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/reports");
    revalidatePath("/activity-log");
    return res;
  });
}

export async function correctOpportunityStageAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await correctOpportunityStage(id, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/sales/opportunities");
    revalidatePath(`/sales/opportunities/${id}`);
    revalidatePath("/activity-log");
    return res;
  });
}

/**
 * "Audit Bukti Dokumen" tab — the retroactive half of the evidence gates
 * (spec: the rule has to apply to existing records too, not just ones
 * created after the gate landed). Surfaces every existing PAID/PARTIALLY_PAID
 * Invoice, ACTIVE Contract, Completed delivery Milestone, and Won Quotation
 * that doesn't actually have the real document on file the corresponding
 * forward-path action now requires.
 */
export async function listMissingEvidenceForCorrection() {
  await assertCorrector();

  const [paidInvoices, activeContracts, completedDeliveryMilestones, wonQuotations] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ["PAID", "PARTIALLY_PAID"] }, deletedAt: null },
      select: { id: true, number: true, status: true, grandTotal: true, paidAmount: true, customer: { select: { companyName: true } } },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.contract.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, number: true, contractValue: true, customer: { select: { companyName: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.projectMilestone.findMany({
      where: { status: "COMPLETED", dateBasis: "ESTIMATED_DELIVERY" },
      select: { id: true, name: true, dueDate: true, project: { select: { number: true, name: true } } },
      orderBy: { dueDate: "desc" },
    }),
    prisma.quotation.findMany({
      where: { status: "WON", deletedAt: null },
      select: { id: true, number: true, revision: true, customer: { select: { companyName: true } } },
      orderBy: { wonAt: "desc" },
    }),
  ]);

  const [payments, contractDocs, milestoneDocs, wonQuotationPOs] = await Promise.all([
    prisma.payment.findMany({
      where: { invoiceId: { in: paidInvoices.map((i) => i.id) }, deletedAt: null },
      select: { id: true, invoiceId: true, number: true, paymentDate: true, amount: true },
      orderBy: { paymentDate: "desc" },
    }),
    prisma.document.findMany({
      where: { relatedEntityType: "CONTRACT", relatedEntityId: { in: activeContracts.map((c) => c.id) }, deletedAt: null },
      select: { relatedEntityId: true },
    }),
    prisma.document.findMany({
      where: { relatedEntityType: "DELIVERY_EVIDENCE", relatedEntityId: { in: completedDeliveryMilestones.map((m) => m.id) }, deletedAt: null },
      select: { relatedEntityId: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { quotationId: { in: wonQuotations.map((q) => q.id) }, deletedAt: null },
      select: { id: true, quotationId: true },
    }),
  ]);

  const [paymentDocs, poDocs] = await Promise.all([
    prisma.document.findMany({
      where: { relatedEntityType: "PAYMENT", relatedEntityId: { in: payments.map((p) => p.id) }, deletedAt: null },
      select: { relatedEntityId: true },
    }),
    prisma.document.findMany({
      where: { relatedEntityType: "PURCHASE_ORDER", relatedEntityId: { in: wonQuotationPOs.map((p) => p.id) }, deletedAt: null },
      select: { relatedEntityId: true },
    }),
  ]);

  const paymentIdsWithDoc = new Set(paymentDocs.map((d) => d.relatedEntityId));
  const contractIdsWithDoc = new Set(contractDocs.map((d) => d.relatedEntityId));
  const milestoneIdsWithDoc = new Set(milestoneDocs.map((d) => d.relatedEntityId));
  const poIdsWithDoc = new Set(poDocs.map((d) => d.relatedEntityId));
  const quotationIdsWithPoEvidence = new Set(
    wonQuotationPOs.filter((p) => poIdsWithDoc.has(p.id)).map((p) => p.quotationId)
  );

  const invoicesMissingEvidence = paidInvoices
    .map((inv) => ({
      ...inv,
      payments: payments
        .filter((p) => p.invoiceId === inv.id)
        .map((p) => ({ ...p, hasDocument: paymentIdsWithDoc.has(p.id) })),
    }))
    .filter((inv) => inv.payments.length === 0 || inv.payments.every((p) => !p.hasDocument));

  const contractsMissingEvidence = activeContracts.filter((c) => !contractIdsWithDoc.has(c.id));
  const milestonesMissingEvidence = completedDeliveryMilestones.filter((m) => !milestoneIdsWithDoc.has(m.id));
  const quotationsMissingEvidence = wonQuotations.filter((q) => !quotationIdsWithPoEvidence.has(q.id));

  return JSON.parse(
    JSON.stringify({ invoicesMissingEvidence, contractsMissingEvidence, milestonesMissingEvidence, quotationsMissingEvidence })
  ) as {
    invoicesMissingEvidence: Array<{
      id: string; number: string; status: string; grandTotal: string; paidAmount: string;
      customer: { companyName: string } | null;
      payments: Array<{ id: string; invoiceId: string; number: string; paymentDate: string; amount: string; hasDocument: boolean }>;
    }>;
    contractsMissingEvidence: Array<{ id: string; number: string; contractValue: string; customer: { companyName: string } | null }>;
    milestonesMissingEvidence: Array<{ id: string; name: string; dueDate: string | null; project: { number: string; name: string } | null }>;
    quotationsMissingEvidence: Array<{ id: string; number: string; revision: number; customer: { companyName: string } | null }>;
  };
}

export async function revertContractToDraftAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await revertContractToDraft(id, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/sales/contracts");
    revalidatePath("/activity-log");
    return res;
  });
}

export async function revertMilestoneToPendingAction(id: string, projectId: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await revertMilestoneToPending(id, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/activity-log");
    return res;
  });
}

export async function attachPaymentEvidenceAction(paymentId: string, formData: FormData): Promise<ActionResult<{ documentId: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requireDataCorrector(actor.role);
    requirePermission(actor.role, "documents", "create");

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("Pilih file bukti transfer terlebih dahulu.");

    const res = await attachPaymentEvidence(
      paymentId,
      { buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name, mimeType: file.type || "application/octet-stream" },
      actor
    );
    revalidatePath("/settings/document-correction");
    revalidatePath("/finance/payments");
    return res;
  });
}

export async function archiveWonArtifactsAction(
  opportunityId: string,
  reason: string
): Promise<ActionResult<{ revertedQuotations: string[]; archivedProjects: string[] }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await archiveWonArtifacts(opportunityId, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/sales/opportunities");
    revalidatePath(`/sales/opportunities/${opportunityId}`);
    revalidatePath("/projects");
    revalidatePath("/projects/folders");
    revalidatePath("/activity-log");
    return res;
  });
}

/** Flat, path-sorted folder list — used to populate the "pindahkan ke" picker in the Documents tab. */
export async function listFoldersForCorrection() {
  await assertCorrector();
  return prisma.folder.findMany({
    select: { id: true, path: true },
    orderBy: { path: "asc" },
  });
}

/**
 * Simple contains-search across originalName/description, capped at 100
 * results — this panel is for finding the one misfiled/misnamed document a
 * person already knows roughly what it's called, not for browsing the
 * whole archive (use /documents for that).
 */
export async function searchDocumentsForCorrection(query: string) {
  await assertCorrector();
  const q = query.trim();
  return prisma.document.findMany({
    where: {
      deletedAt: null,
      ...(q ? { OR: [{ originalName: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    },
    select: {
      id: true, originalName: true, mimeType: true, uploadedAt: true, relatedEntityType: true,
      folder: { select: { id: true, path: true } },
    },
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });
}

export async function correctQuotationNumberAction(id: string, newNumber: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await correctDocumentNumber("QUOTATION", id, newNumber, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath(`/sales/quotations/${id}`);
    revalidatePath("/activity-log");
    return res;
  });
}

export async function correctVendorPONumberAction(id: string, newNumber: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await correctDocumentNumber("VENDOR_PO", id, newNumber, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/procurement/vendor-po");
    revalidatePath("/activity-log");
    return res;
  });
}

export async function correctInvoiceNumberAction(id: string, newNumber: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await correctDocumentNumber("INVOICE", id, newNumber, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/finance/invoices");
    revalidatePath("/activity-log");
    return res;
  });
}

export async function correctProgressReportAction(
  id: string,
  input: { number: string; title: string | null; reportKind: string | null },
  reason: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await correctProgressReportDetails(id, input, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/activity-log");
    return res;
  });
}

export async function renameDocumentAction(id: string, newName: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await renameDocumentFile(id, newName, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/documents");
    revalidatePath("/activity-log");
    return res;
  });
}

export async function relocateDocumentAction(id: string, newFolderId: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await relocateDocument(id, newFolderId, reason, actor);
    revalidatePath("/settings/document-correction");
    revalidatePath("/documents");
    revalidatePath("/activity-log");
    return res;
  });
}
