"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requireDataCorrector } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  correctDocumentNumber,
  correctProgressReportDetails,
  renameDocumentFile,
  relocateDocument,
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
