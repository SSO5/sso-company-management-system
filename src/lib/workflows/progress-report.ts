import { prisma } from "@/lib/db";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { getStorageDriver } from "@/lib/storage";
import type { ProgressReportInput, ProgressReportItemInput } from "@/lib/validation/project";

/**
 * Field engineering progress/inspection reports (spec: real "ENG-REP-004"
 * template found in SSO's WhatsApp field archive). Deliberately NOT part of
 * the maker-checker approval chain — this is an internal record of what an
 * engineer did on site, not a commercial document needing Direktur sign-off.
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
    // Best-effort cleanup of uploaded photos — not transactional (storage
    // isn't part of the DB transaction), but a failed delete here should
    // never block the DB row from being removed, so errors are swallowed.
    const items = await tx.progressReportItem.findMany({ where: { progressReportId: id } });
    const driver = getStorageDriver();
    for (const item of items) {
      if (item.photoBeforeKey) await driver.delete(item.photoBeforeKey).catch(() => {});
      if (item.photoAfterKey) await driver.delete(item.photoAfterKey).catch(() => {});
    }
    await tx.progressReport.delete({ where: { id } });
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
    const created = await tx.progressReportItem.create({
      data: {
        progressReportId: data.progressReportId,
        partName: data.partName,
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
  data: Partial<Pick<ProgressReportItemInput, "partName" | "notes" | "isDone">>,
  photos: ProgressReportItemPhotos,
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.progressReportItem.findUniqueOrThrow({ where: { id } });
    // Replacing a photo deletes the old one from storage so orphaned files
    // don't pile up in the bucket — same reasoning as branding asset swaps.
    const driver = getStorageDriver();
    if (photos.photoBeforeKey && existing.photoBeforeKey) await driver.delete(existing.photoBeforeKey).catch(() => {});
    if (photos.photoAfterKey && existing.photoAfterKey) await driver.delete(existing.photoAfterKey).catch(() => {});

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
    const driver = getStorageDriver();
    if (existing.photoBeforeKey) await driver.delete(existing.photoBeforeKey).catch(() => {});
    if (existing.photoAfterKey) await driver.delete(existing.photoAfterKey).catch(() => {});
    await tx.progressReportItem.delete({ where: { id } });
    await logActivity(tx, {
      userId: actorId, action: "DELETE", entityType: "PROGRESS_REPORT_ITEM", entityId: id,
      description: `Removed checkpoint "${existing.partName}"`,
    });
    return existing;
  });
}
