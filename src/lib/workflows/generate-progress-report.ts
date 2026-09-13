import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getStorageDriver } from "@/lib/storage";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { isExtractableMimeType } from "@/lib/ai/client";
import { extractProgressReport } from "@/lib/ai/extract-progress-report";
import { extractEmbeddedPhotos } from "@/lib/pdf/extract-embedded-images";
import type { SessionPayload } from "@/lib/auth/session";
const FILE_NAME_DATE = /^(\d{4})-(\d{2})-(\d{2})\s*-\s*/;
export async function generateProgressReportForActor(
  documentId: string,
  projectId: string,
  actor: SessionPayload,
): Promise<{ progressReportId: string }> {
  requirePermission(actor.role, "project", "create");

  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId, deletedAt: null },
    include: { folder: { select: { projectId: true } } },
  });
  if (doc.folder?.projectId !== projectId)
    throw new Error("Dokumen tidak berada di proyek ini.");
  if (!isExtractableMimeType(doc.mimeType)) {
    throw new Error(
      "Tipe file ini tidak didukung untuk ekstraksi otomatis (hanya PDF/gambar).",
    );
  }

  const driver = getStorageDriver();
  const buffer = await driver.read(doc.storagePath);
  const extracted = await extractProgressReport(
    buffer,
    doc.mimeType,
    doc.originalName,
  );

  // Pull the real photos out of the source PDF so the generated report
  // carries the same evidence photos the document shows per checkpoint â€”
  // not just the extracted text. Distributed across items using each
  // item's own photoCount, in document order (see extract-embedded-images.ts
  // for why this is a best-effort match rather than a guaranteed one).
  const embeddedPhotos =
    doc.mimeType === "application/pdf"
      ? await extractEmbeddedPhotos(buffer)
      : [];
  let photoCursor = 0;
  const itemPhotos: {
    photoBeforeKey?: string;
    photoBeforeSize?: number;
    photoAfterKey?: string;
    photoAfterSize?: number;
  }[] = [];
  for (const it of extracted.items) {
    const slots: (typeof itemPhotos)[number] = {};
    const take = Math.min(
      it.photoCount,
      2,
      embeddedPhotos.length - photoCursor,
    );
    for (let slot = 0; slot < take; slot++) {
      const photoBuf = embeddedPhotos[photoCursor++];
      const saved = await driver.save(photoBuf, {
        originalName: `${doc.originalName}-photo-${photoCursor}.jpg`,
        mimeType: "image/jpeg",
      });
      if (slot === 0) {
        slots.photoBeforeKey = saved.storageKey;
        slots.photoBeforeSize = saved.fileSize;
      } else {
        slots.photoAfterKey = saved.storageKey;
        slots.photoAfterSize = saved.fileSize;
      }
    }
    itemPhotos.push(slots);
  }

  const nameMatch = doc.originalName.match(FILE_NAME_DATE);
  const fallbackDate = nameMatch
    ? new Date(
        Number(nameMatch[1]),
        Number(nameMatch[2]) - 1,
        Number(nameMatch[3]),
      )
    : doc.uploadedAt;
  const inspectionDate = extracted.inspectionDate
    ? new Date(extracted.inspectionDate)
    : fallbackDate;

  const existing = await prisma.progressReport.findUnique({
    where: { sourceDocumentId: documentId },
  });

  const report = await prisma.$transaction(async (tx) => {
    let r;
    if (existing) {
      const oldItems = await tx.progressReportItem.findMany({
        where: { progressReportId: existing.id },
      });
      for (const oldItem of oldItems) {
        if (oldItem.photoBeforeKey)
          await driver.delete(oldItem.photoBeforeKey).catch(() => {});
        if (oldItem.photoAfterKey)
          await driver.delete(oldItem.photoAfterKey).catch(() => {});
      }
      await tx.progressReportItem.deleteMany({
        where: { progressReportId: existing.id },
      });
      r = await tx.progressReport.update({
        where: { id: existing.id },
        data: {
          inspectionDate,
          location: extracted.location,
          summary: extracted.summary,
          overallPercent: extracted.overallPercent,
          aiGenerated: true,
        },
      });
    } else {
      const number = await generateNumber(tx, "PROGRESS_REPORT");
      r = await tx.progressReport.create({
        data: {
          number,
          projectId,
          inspectionDate,
          location: extracted.location,
          summary: extracted.summary,
          overallPercent: extracted.overallPercent,
          preparedById: actor.userId,
          createdById: actor.userId,
          sourceDocumentId: documentId,
          aiGenerated: true,
        },
      });
    }
    if (extracted.items.length > 0) {
      await tx.progressReportItem.createMany({
        data: extracted.items.map((it, i) => ({
          progressReportId: r.id,
          sectionName: it.sectionName,
          partName: it.partName,
          quantity: it.quantity,
          notes: it.notes,
          isDone: it.isDone,
          sortOrder: i,
          ...itemPhotos[i],
        })),
      });
    }
    await logActivity(tx, {
      userId: actor.userId,
      action: existing ? "UPDATE" : "CREATE",
      entityType: "PROGRESS_REPORT",
      entityId: r.id,
      description: `${existing ? "Membuat ulang" : "Membuat"} checklist AI dari "${doc.originalName}" (${extracted.items.length} item, confidence: ${extracted.confidence})`,
    });
    return r;
  });

  revalidatePath(`/projects/${projectId}`);
  return { progressReportId: report.id };
}
