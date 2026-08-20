import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/workflows/audit";
import { entityTypeForRouteKey } from "@/lib/workflows/folders";
import type { SessionPayload } from "@/lib/auth/session";
import { requireDataCorrector } from "@/lib/permissions";

/**
 * IT / data-integrity corrections.
 *
 * Every other workflow in this app (quotation.ts, vendor-po.ts, finance.ts,
 * progress-reports.ts) locks a record's identity the moment it leaves DRAFT —
 * "Only draft quotations can be edited. Submitted quotations are locked." —
 * on purpose, because a number that can quietly change after it's been sent
 * to a customer is worse than a wrong number that's at least stable.
 *
 * But that lock has no escape hatch, and SSO's real import/OCR pipeline
 * occasionally reads an uploaded file wrong: two reports get issued the same
 * number, a PO lands under the wrong project, a scanned invoice's number is
 * transposed. When that happens there is currently no way for ANYONE —
 * including Admin — to fix it without going around the app directly in the
 * database, which is exactly the kind of unaudited edit this app exists to
 * prevent.
 *
 * This file is the one, explicit, logged exception to the lock. It only
 * touches identity fields (document number, file name, which folder/project
 * something is filed under) — never totals, prices, or approval state — so
 * a correction can never be used to quietly rewrite what was actually
 * quoted, ordered, or invoiced. Every call is gated by requireDataCorrector
 * (ADMIN or IT only) and writes a before/after entry to the Activity Log
 * with the reason the caller gave, inside the same transaction as the
 * change itself.
 */

type CorrectableKind = "QUOTATION" | "VENDOR_PO" | "INVOICE" | "PROGRESS_REPORT";

async function assertNumberFree(kind: CorrectableKind, number: string, excludeId: string) {
  const existing = await ({
    QUOTATION: () => prisma.quotation.findUnique({ where: { number } }),
    VENDOR_PO: () => prisma.vendorPurchaseOrder.findUnique({ where: { number } }),
    INVOICE: () => prisma.invoice.findUnique({ where: { number } }),
    PROGRESS_REPORT: () => prisma.progressReport.findUnique({ where: { number } }),
  }[kind]());
  if (existing && existing.id !== excludeId) {
    throw new Error(`Nomor "${number}" sudah dipakai dokumen lain. Pilih nomor lain.`);
  }
}

/**
 * Renumber a Quotation, Vendor PO, Invoice, or Progress Report — the case
 * the founder described directly: the automated pipeline read two documents
 * as the same number, or reversed a sequence, and it needs correcting after
 * the fact even though the document has already been submitted/sent/won.
 */
export async function correctDocumentNumber(
  kind: CorrectableKind,
  id: string,
  newNumber: string,
  reason: string,
  actor: SessionPayload
) {
  requireDataCorrector(actor.role);
  const trimmed = newNumber.trim();
  if (!trimmed) throw new Error("Nomor baru tidak boleh kosong.");
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi — ini akan tercatat di Log Aktivitas.");

  await assertNumberFree(kind, trimmed, id);

  await prisma.$transaction(async (tx) => {
    let oldNumber: string;
    let entityType: string;

    switch (kind) {
      case "QUOTATION": {
        const row = await tx.quotation.findUniqueOrThrow({ where: { id } });
        oldNumber = row.number;
        await tx.quotation.update({ where: { id }, data: { number: trimmed } });
        entityType = "QUOTATION";
        break;
      }
      case "VENDOR_PO": {
        const row = await tx.vendorPurchaseOrder.findUniqueOrThrow({ where: { id } });
        oldNumber = row.number;
        await tx.vendorPurchaseOrder.update({ where: { id }, data: { number: trimmed } });
        entityType = "VENDOR_PO";
        break;
      }
      case "INVOICE": {
        const row = await tx.invoice.findUniqueOrThrow({ where: { id } });
        oldNumber = row.number;
        await tx.invoice.update({ where: { id }, data: { number: trimmed } });
        entityType = "INVOICE";
        break;
      }
      case "PROGRESS_REPORT": {
        const row = await tx.progressReport.findUniqueOrThrow({ where: { id } });
        oldNumber = row.number;
        await tx.progressReport.update({ where: { id }, data: { number: trimmed } });
        entityType = "PROGRESS_REPORT";
        break;
      }
      default:
        throw new Error(`Unknown correction kind: ${kind as string}`);
    }

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType,
      entityId: id,
      description: `[Koreksi IT] Nomor diubah dari "${oldNumber}" menjadi "${trimmed}". Alasan: ${reason.trim()}`,
      metadata: { correction: "NUMBER", oldNumber, newNumber: trimmed, reason: reason.trim(), correctedBy: actor.name, correctedByRole: actor.role },
    });
  });

  return { id, number: trimmed };
}

/**
 * Progress reports carry two more identity-ish fields that the same
 * mis-classification problem hits: `title` and `reportKind` (PEMERIKSAAN vs
 * PROGRES — see the ENG-REP reconciliation). Bundled into the same
 * correction rather than a second dialog, since they're fixed together in
 * practice (a wrongly classified report usually also has a generic/wrong
 * title carried over from the OCR).
 */
export async function correctProgressReportDetails(
  id: string,
  input: { number: string; title: string | null; reportKind: string | null },
  reason: string,
  actor: SessionPayload
) {
  requireDataCorrector(actor.role);
  const trimmed = input.number.trim();
  if (!trimmed) throw new Error("Nomor baru tidak boleh kosong.");
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi — ini akan tercatat di Log Aktivitas.");

  await assertNumberFree("PROGRESS_REPORT", trimmed, id);

  await prisma.$transaction(async (tx) => {
    const row = await tx.progressReport.findUniqueOrThrow({ where: { id } });
    await tx.progressReport.update({
      where: { id },
      data: { number: trimmed, title: input.title, reportKind: input.reportKind || "PROGRES" },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "PROGRESS_REPORT",
      entityId: id,
      description:
        `[Koreksi IT] ${row.number} -> ${trimmed}` +
        (row.title !== input.title ? `, judul "${row.title ?? "-"}" -> "${input.title ?? "-"}"` : "") +
        (row.reportKind !== input.reportKind ? `, jenis ${row.reportKind ?? "-"} -> ${input.reportKind ?? "-"}` : "") +
        `. Alasan: ${reason.trim()}`,
      metadata: {
        correction: "PROGRESS_REPORT_DETAILS",
        old: { number: row.number, title: row.title, reportKind: row.reportKind },
        new: { number: trimmed, title: input.title, reportKind: input.reportKind },
        reason: reason.trim(),
        correctedBy: actor.name,
        correctedByRole: actor.role,
      },
    });
  });

  return { id };
}

/** Rename an uploaded file's display name — never touches the stored bytes. */
export async function renameDocumentFile(documentId: string, newOriginalName: string, reason: string, actor: SessionPayload) {
  requireDataCorrector(actor.role);
  const trimmed = newOriginalName.trim();
  if (!trimmed) throw new Error("Nama file baru tidak boleh kosong.");
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi — ini akan tercatat di Log Aktivitas.");

  await prisma.$transaction(async (tx) => {
    const row = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
    await tx.document.update({ where: { id: documentId }, data: { originalName: trimmed } });
    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "DOCUMENT",
      entityId: documentId,
      description: `[Koreksi IT] Nama dokumen diubah dari "${row.originalName}" menjadi "${trimmed}". Alasan: ${reason.trim()}`,
      metadata: { correction: "RENAME", oldName: row.originalName, newName: trimmed, reason: reason.trim(), correctedBy: actor.name, correctedByRole: actor.role },
    });
  });

  return { id: documentId };
}

/**
 * Revert an Opportunity wrongly stuck on WON or LOST back to NEGOTIATION —
 * the correction for a deal's stage having been set directly (e.g. through
 * the plain stage picker, before that hole was closed) instead of through
 * markQuotationWon/markQuotationLost in lib/workflows/quotation.ts. Same
 * "explicit, logged exception" contract as the rest of this file: ADMIN/IT
 * only, reason required, audited.
 *
 * Deliberately does NOT touch any Project/Invoice/Task already generated
 * from a wrongly-Won deal, and does NOT attempt to merge multiple open
 * Quotations on the same deal into one — both are judgment calls for a
 * human, not something safe to automate here.
 */
export async function correctOpportunityStage(id: string, reason: string, actor: SessionPayload) {
  requireDataCorrector(actor.role);
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi — ini akan tercatat di Log Aktivitas.");

  return prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.findUniqueOrThrow({ where: { id } });
    if (opp.status !== "WON" && opp.status !== "LOST") {
      throw new Error(`${opp.number} sedang berstatus ${opp.status}, bukan Won/Lost — tidak ada yang perlu dikoreksi.`);
    }
    const newStatus = "NEGOTIATION" as const;
    await tx.opportunity.update({ where: { id }, data: { status: newStatus } });
    await logActivity(tx, {
      userId: actor.userId,
      action: "STATUS_CHANGE",
      entityType: "OPPORTUNITY",
      entityId: id,
      description: `[Koreksi IT] ${opp.number}: ${opp.status} -> ${newStatus}. Alasan: ${reason.trim()}`,
      metadata: {
        correction: "OPPORTUNITY_STAGE",
        oldStatus: opp.status,
        newStatus,
        reason: reason.trim(),
        correctedBy: actor.name,
        correctedByRole: actor.role,
      },
    });
    return { id, number: opp.number, oldStatus: opp.status, newStatus };
  });
}

/**
 * Undoes the concrete artifacts a wrongly-Won deal left behind: any
 * Quotation still sitting at WON on this Opportunity gets reverted to SENT
 * (clears wonAt — "SENT" because that's what a real customer-facing
 * negotiation looks like, and it's exactly what markQuotationSent already
 * maps to Opportunity stage NEGOTIATION, so the two stay consistent), and
 * the Project that Won automatically generated (see convertQuotationToProject)
 * is soft-deleted so it stops appearing in Documents/project listings and
 * the dashboard.
 *
 * Deliberately independent of the Opportunity's CURRENT stage — unlike
 * correctOpportunityStage, this doesn't require status to still be WON,
 * because reverting the stage and cleaning up its artifacts are two
 * separate corrections that can happen at different times (e.g. someone
 * already reverted the stage, then noticed the stray Project days later).
 * Only touches Quotations that are still WON and Projects that aren't
 * already deleted, so running it twice is a harmless no-op the second time.
 */
export async function archiveWonArtifacts(opportunityId: string, reason: string, actor: SessionPayload) {
  requireDataCorrector(actor.role);
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi — ini akan tercatat di Log Aktivitas.");

  return prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    const wonQuotations = await tx.quotation.findMany({
      where: { opportunityId, status: "WON", deletedAt: null },
      include: { project: true },
    });

    const revertedQuotations: string[] = [];
    const archivedProjects: string[] = [];

    for (const q of wonQuotations) {
      await tx.quotation.update({ where: { id: q.id }, data: { status: "SENT", wonAt: null } });
      revertedQuotations.push(q.number);
      if (q.project && !q.project.deletedAt) {
        await tx.project.update({ where: { id: q.project.id }, data: { deletedAt: new Date() } });
        archivedProjects.push(q.project.number);
      }
    }

    if (revertedQuotations.length === 0) {
      throw new Error(`${opp.number} tidak punya quotation berstatus Won yang perlu dikembalikan — tidak ada yang diubah.`);
    }

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "OPPORTUNITY",
      entityId: opportunityId,
      description:
        `[Koreksi IT] ${opp.number}: Quotation dikembalikan dari Won ke Sent (${revertedQuotations.join(", ")})` +
        (archivedProjects.length ? `, Project diarsipkan (${archivedProjects.join(", ")})` : "") +
        `. Alasan: ${reason.trim()}`,
      metadata: {
        correction: "ARCHIVE_WON_ARTIFACTS",
        revertedQuotations,
        archivedProjects,
        reason: reason.trim(),
        correctedBy: actor.name,
        correctedByRole: actor.role,
      },
    });

    return { revertedQuotations, archivedProjects };
  });
}

/**
 * Re-file a document into a different folder — the fix for the exact
 * failure mode described: automation matched a folder to the wrong
 * project/customer, so an upload lands in the wrong job's tree. Also
 * refreshes relatedEntityType to match the destination folder's routeKey so
 * downstream checks (e.g. document-checklist completeness, project-closing
 * validation) see it in the right place, not just the file browser.
 */
export async function relocateDocument(documentId: string, newFolderId: string, reason: string, actor: SessionPayload) {
  requireDataCorrector(actor.role);
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi — ini akan tercatat di Log Aktivitas.");

  await prisma.$transaction(async (tx) => {
    const [row, destFolder] = await Promise.all([
      tx.document.findUniqueOrThrow({ where: { id: documentId }, include: { folder: { select: { path: true } } } }),
      tx.folder.findUniqueOrThrow({ where: { id: newFolderId } }),
    ]);

    await tx.document.update({
      where: { id: documentId },
      data: {
        folderId: newFolderId,
        relatedEntityType: entityTypeForRouteKey(destFolder.routeKey) ?? row.relatedEntityType,
      },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPDATE",
      entityType: "DOCUMENT",
      entityId: documentId,
      description: `[Koreksi IT] "${row.originalName}" dipindah dari "${row.folder?.path ?? "-"}" ke "${destFolder.path}". Alasan: ${reason.trim()}`,
      metadata: { correction: "RELOCATE", oldFolderId: row.folderId, newFolderId, reason: reason.trim(), correctedBy: actor.name, correctedByRole: actor.role },
    });
  });

  return { id: documentId };
}
