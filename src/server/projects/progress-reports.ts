"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { assertFileAllowed, getStorageDriver } from "@/lib/storage";
import { progressReportSchema, progressReportItemSchema } from "@/lib/validation/project";
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

export async function createProgressReportAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = progressReportSchema.parse(input);
    const report = await createProgressReport(data, actor.userId);
    revalidatePath(`/projects/${data.projectId}`);
    return { id: report.id };
  });
}

export async function deleteProgressReportAction(id: string, projectId: string): Promise<ActionResult<{ id: string }>> {
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
 * file uploads alongside the text fields — same reason
 * updateCompanySettings/logo upload does (see server/settings/company.ts).
 */
export async function addProgressReportItemAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = progressReportItemSchema.parse({
      progressReportId: formData.get("progressReportId"),
      sectionName: formData.get("sectionName") || null,
      partName: formData.get("partName"),
      notes: formData.get("notes") || null,
      isDone: formData.get("isDone") === "on" || formData.get("isDone") === "true",
      sortOrder: formData.get("sortOrder") || 0,
    });

    const photos: ProgressReportItemPhotos = {};
    const driver = getStorageDriver();

    const before = formData.get("photoBefore");
    if (before instanceof File && before.size > 0) {
      assertFileAllowed(before.name, before.type, before.size);
      const buffer = Buffer.from(await before.arrayBuffer());
      const saved = await driver.save(buffer, { originalName: before.name, mimeType: before.type });
      photos.photoBeforeKey = saved.storageKey;
      photos.photoBeforeSize = saved.fileSize;
    }
    const after = formData.get("photoAfter");
    if (after instanceof File && after.size > 0) {
      assertFileAllowed(after.name, after.type, after.size);
      const buffer = Buffer.from(await after.arrayBuffer());
      const saved = await driver.save(buffer, { originalName: after.name, mimeType: after.type });
      photos.photoAfterKey = saved.storageKey;
      photos.photoAfterSize = saved.fileSize;
    }

    const item = await addProgressReportItem(data, photos, actor.userId);
    const report = await prisma.progressReport.findUniqueOrThrow({ where: { id: data.progressReportId } });
    revalidatePath(`/projects/${report.projectId}`);
    return { id: item.id };
  });
}

export async function updateProgressReportItemAction(
  id: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");

    const partNameRaw = formData.get("partName");
    const notesRaw = formData.get("notes");
    const isDoneRaw = formData.get("isDone");
    const data: Partial<{ partName: string; notes: string | null; isDone: boolean }> = {};
    if (typeof partNameRaw === "string" && partNameRaw.length > 0) data.partName = partNameRaw;
    if (notesRaw !== null) data.notes = (notesRaw as string) || null;
    if (isDoneRaw !== null) data.isDone = isDoneRaw === "on" || isDoneRaw === "true";

    const photos: ProgressReportItemPhotos = {};
    const driver = getStorageDriver();
    const before = formData.get("photoBefore");
    if (before instanceof File && before.size > 0) {
      assertFileAllowed(before.name, before.type, before.size);
      const buffer = Buffer.from(await before.arrayBuffer());
      const saved = await driver.save(buffer, { originalName: before.name, mimeType: before.type });
      photos.photoBeforeKey = saved.storageKey;
      photos.photoBeforeSize = saved.fileSize;
    }
    const after = formData.get("photoAfter");
    if (after instanceof File && after.size > 0) {
      assertFileAllowed(after.name, after.type, after.size);
      const buffer = Buffer.from(await after.arrayBuffer());
      const saved = await driver.save(buffer, { originalName: after.name, mimeType: after.type });
      photos.photoAfterKey = saved.storageKey;
      photos.photoAfterSize = saved.fileSize;
    }

    await updateProgressReportItem(id, data, photos, actor.userId);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

export async function deleteProgressReportItemAction(id: string, projectId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    await deleteProgressReportItem(id, actor.userId);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}
