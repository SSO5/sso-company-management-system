import { prisma } from "@/lib/db";
import { lockReport } from "./report-review";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { getStorageDriver } from "@/lib/storage";
import type { ProgressReportInput, ProgressReportItemInput } from "@/lib/validation/project";

/**
 * Field engineering progress/inspection reports (spec: real "ENG-REP-004"
 * template found in SSO's WhatsApp field archive). Working copies stay editable;
 * external issue requires a separate immutable director-approved review.
 * Numbering still goes through the same atomic generateNumber() as every
 * other document type, inside the same transaction as the row insert, so a
 * failed create never burns a number.
 */
export async function createProgressReport(data: ProgressReportInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const number = await generateNumber(tx, "PROGRESS_REPORT");
    const created = await tx.progressReport.create({
      data: {
        number,
        projectId: data.projectId,
        inspectionDate: data.inspectionDate,
        location: data.location ?? null,
        preparedById: data.preparedById,
        createdById: actorId,
      },
    });
    await logActivity(tx, {
      userId: actorId, action: "CREATE", entityType: "PROGRESS_REPORT", entityId: created.id,
      description: `Created progress report ${created.number}`,
    });
    return created;
  });
}

export async function deleteProgressReport(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.progressReport.findUniqueOrThrow({ where: { id } });
    await lockReport(tx, id);
    // Preserve source evidence, review history and photos on archive.
    await tx.progressReport.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(tx, {
      userId: actorId, action: "DELETE", entityType: "PROGRESS_REPORT", entityId: id,
      description: `Deleted progress report ${report.number}`,
    });
    return report;
  });
}

export interface ProgressReportItemPhotos {
  photoBeforeKey?: string;
  photoBeforeSize?: number;
  photoAfterKey?: string;
  photoAfterSize?: number;
}

export async function addProgressReportItem(
  data: ProgressReportItemInput,
  photos: ProgressReportItemPhotos,
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    await lockReport(tx, data.progressReportId);
    await tx.progressReport.findUniqueOrThrow({ where: { id: data.progressReportId, deletedAt: null } });
    const created = await tx.progressReportItem.create({
      data: {
        progressReportId: data.progressReportId,
        sectionName: data.sectionName ?? null,
        partName: data.partName,
        quantity: data.quantity ?? null,
        notes: data.notes ?? null,
        isDone: data.isDone,
        sortOrder: data.sortOrder,
        ...photos,
      },
    });
    await logActivity(tx, {
      userId: actorId, action: "CREATE", entityType: "PROGRESS_REPORT_ITEM", entityId: created.id,
      description: `Added checkpoint "${created.partName}" to progress report`,
    });
    return created;
  });
}

export async function updateProgressReportItem(
  id: string,
  data: Partial<Pick<ProgressReportItemInput, "partName" | "quantity" | "notes" | "isDone">>,
  photos: ProgressReportItemPhotos,
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.progressReportItem.findUniqueOrThrow({ where: { id } });
    await lockReport(tx, existing.progressReportId);
    await tx.progressReport.findUniqueOrThrow({ where: { id: existing.progressReportId, deletedAt: null } });
    // Old photo keys can still be referenced by frozen review snapshots.

    const updated = await tx.progressReportItem.update({ where: { id }, data: { ...data, ...photos } });
    await logActivity(tx, {
      userId: actorId, action: "UPDATE", entityType: "PROGRESS_REPORT_ITEM", entityId: id,
      description: `Updated checkpoint "${updated.partName}"`,
    });
    return updated;
  });
}

export async function deleteProgressReportItem(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.progressReportItem.findUniqueOrThrow({ where: { id } });
    await lockReport(tx, existing.progressReportId);
    await tx.progressReport.findUniqueOrThrow({ where: { id: existing.progressReportId, deletedAt: null } });
    await tx.progressReportItem.delete({ where: { id } });
    await logActivity(tx, {
      userId: actorId, action: "DELETE", entityType: "PROGRESS_REPORT_ITEM", entityId: id,
      description: `Removed checkpoint "${existing.partName}"`,
    });
    return existing;
  });
}
