"use server";
import { generateProgressReportForActor } from "@/lib/workflows/generate-progress-report";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { assertFileAllowed, getStorageDriver } from "@/lib/storage";
import {
  progressReportSchema,
  progressReportItemSchema,
} from "@/lib/validation/project";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { isExtractableMimeType } from "@/lib/ai/client";
import { extractProgressReport } from "@/lib/ai/extract-progress-report";
import { extractEmbeddedPhotos } from "@/lib/pdf/extract-embedded-images";
import type { SessionPayload } from "@/lib/auth/session";
import {
  createProgressReport,
  deleteProgressReport,
  addProgressReportItem,
  updateProgressReportItem,
  deleteProgressReportItem,
  type ProgressReportItemPhotos,
} from "@/lib/workflows/progress-report";

export async function getProgressReports(projectId: string) {
  await requireUserOrThrow();
  return prisma.progressReport.findMany({
    where: { projectId, deletedAt: null },
    include: {
      preparedBy: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { inspectionDate: "desc" },
  });
}

/**
 * A field-typed checklist (partName/isDone re-keyed by hand) turned out to be
 * a second, lossier copy of what the real inspection/progress PDF already
 * says â€” someone has to open the PDF to write the checklist, then a reader
 * has to trust the checklist matches it. The real report IS the record.
 *
 * This reads the project's "03 Project / Progress Report" folder directly â€”
 * same Document rows the Documents module and the bulk importer
 * (prisma/import-documents.ts) already use â€” and orders them the way SSO's
 * own field team already names files: "YYYY-MM-DD - <title>.pdf". A file
 * without that prefix falls back to its upload date, so nothing is dropped
 * for not following the convention, it just sorts by when it landed in the
 * app instead of when the visit happened.
 */
export async function getProgressReportDocuments(projectId: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "documents", "view");

  const folder = await prisma.folder.findFirst({
    where: { projectId, routeKey: "PROJECT/PROGRESS_REPORT" },
  });
  if (!folder) return { folderId: null, documents: [] };

  const docs = await prisma.document.findMany({
    where: { folderId: folder.id, deletedAt: null },
    include: {
      uploadedBy: { select: { name: true } },
      // Already-generated checklist for this exact file, if any â€” lets the
      // UI show it immediately instead of a per-file loading round trip.
      progressReport: { select: { id: true, summary: true, overallPercent: true, aiGenerated: true, dateVerified: true, inspectionDate: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true, sectionName: true, partName: true, quantity: true, notes: true, isDone: true } } } },
    },
  });

  const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})\s*-\s*(.+)$/;
  const documents = docs
    .map((d) => {
      const m = d.originalName.match(DATE_PREFIX);
      const reportDate = d.progressReport?.dateVerified ? d.progressReport.inspectionDate : m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        : d.uploadedAt;
      const displayName = m ? m[4] : d.originalName;
      const { storagePath: _privateStorage, ...safeDocument } = d;
      return { ...safeDocument, reportDate, displayName, dateFromFileName: !d.progressReport?.dateVerified && Boolean(m) };
    })
    .sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime());

  return { folderId: folder.id, documents };
}

export async function createProgressReportAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = progressReportSchema.parse(input);
    const report = await createProgressReport(data, actor.userId);
    revalidatePath(`/projects/${data.projectId}`);
    return { id: report.id };
  });
}

export async function deleteProgressReportAction(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "delete");
    await deleteProgressReport(id, actor.userId);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

/**
 * FormData (not JSON) because "Foto sebelum" / "Foto sesudah" are optional
 * file uploads alongside the text fields â€” same reason
 * updateCompanySettings/logo upload does (see server/settings/company.ts).
 */
export async function addProgressReportItemAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = progressReportItemSchema.parse({
      progressReportId: formData.get("progressReportId"),
      sectionName: formData.get("sectionName") || null,
      partName: formData.get("partName"),
      quantity: formData.get("quantity") || null,
      notes: formData.get("notes") || null,
      isDone:
        formData.get("isDone") === "on" || formData.get("isDone") === "true",
      sortOrder: formData.get("sortOrder") || 0,
    });

    const photos: ProgressReportItemPhotos = {};
    const driver = getStorageDriver();

    const before = formData.get("photoBefore");
    if (before instanceof File && before.size > 0) {
      assertFileAllowed(before.name, before.type, before.size);
      const buffer = Buffer.from(await before.arrayBuffer());
      const saved = await driver.save(buffer, {
        originalName: before.name,
        mimeType: before.type,
      });
      photos.photoBeforeKey = saved.storageKey;
      photos.photoBeforeSize = saved.fileSize;
    }
    const after = formData.get("photoAfter");
    if (after instanceof File && after.size > 0) {
      assertFileAllowed(after.name, after.type, after.size);
      const buffer = Buffer.from(await after.arrayBuffer());
      const saved = await driver.save(buffer, {
        originalName: after.name,
        mimeType: after.type,
      });
      photos.photoAfterKey = saved.storageKey;
      photos.photoAfterSize = saved.fileSize;
    }

    const item = await addProgressReportItem(data, photos, actor.userId);
    const report = await prisma.progressReport.findUniqueOrThrow({
      where: { id: data.progressReportId },
    });
    revalidatePath(`/projects/${report.projectId}`);
    return { id: item.id };
  });
}

export async function updateProgressReportItemAction(
  id: string,
  projectId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");

    const partNameRaw = formData.get("partName");
    const notesRaw = formData.get("notes");
    const isDoneRaw = formData.get("isDone");
    const data: Partial<{
      partName: string;
      notes: string | null;
      isDone: boolean;
    }> = {};
    if (typeof partNameRaw === "string" && partNameRaw.length > 0)
      data.partName = partNameRaw;
    if (notesRaw !== null) data.notes = (notesRaw as string) || null;
    if (isDoneRaw !== null)
      data.isDone = isDoneRaw === "on" || isDoneRaw === "true";

    const photos: ProgressReportItemPhotos = {};
    const driver = getStorageDriver();
    const before = formData.get("photoBefore");
    if (before instanceof File && before.size > 0) {
      assertFileAllowed(before.name, before.type, before.size);
      const buffer = Buffer.from(await before.arrayBuffer());
      const saved = await driver.save(buffer, {
        originalName: before.name,
        mimeType: before.type,
      });
      photos.photoBeforeKey = saved.storageKey;
      photos.photoBeforeSize = saved.fileSize;
    }
    const after = formData.get("photoAfter");
    if (after instanceof File && after.size > 0) {
      assertFileAllowed(after.name, after.type, after.size);
      const buffer = Buffer.from(await after.arrayBuffer());
      const saved = await driver.save(buffer, {
        originalName: after.name,
        mimeType: after.type,
      });
      photos.photoAfterKey = saved.storageKey;
      photos.photoAfterSize = saved.fileSize;
    }

    await updateProgressReportItem(id, data, photos, actor.userId);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

export async function deleteProgressReportItemAction(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    await deleteProgressReportItem(id, actor.userId);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

const FILE_NAME_DATE = /^(\d{4})-(\d{2})-(\d{2})\s*-\s*/;

/**
 * Reads a specific uploaded progress-report Document with Claude and turns
 * it into a real, checkable ProgressReport + items â€” the checklist a reader
 * can trust because it was generated FROM that exact file, not typed by
 * hand from memory. Re-running this on a document that already has one
 * replaces its items (e.g. after re-uploading a corrected scan) rather than
 * creating a duplicate.
 */
export async function generateProgressReportFromDocument(
  documentId: string,
  projectId: string,
  force = false,
): Promise<ActionResult<{ progressReportId: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    return generateProgressReportForActor(documentId, projectId, actor, force);
  });
}

/**
 * Same generation logic as generateProgressReportFromDocument, but taking an
 * explicit actor instead of deriving one via requireUserOrThrow() (which
 * needs a real Next.js request/cookie context) â€” so callers with their own
 * already-resolved identity (AISSO's confirm step, the Telegram bot via
 * resolveActorByTelegramChatId) can call this directly. The cookie-based
 * action above is the one thing the browser-invoked Documents panel calls;
 * everyone else should call this.
 */
