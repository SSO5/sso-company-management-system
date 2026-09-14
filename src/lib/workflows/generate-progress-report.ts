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
import { lockReport } from "./report-review";
import { parseReportDate } from "@/lib/weekly-policy";
const FILE_NAME_DATE = /^(\d{4})-(\d{2})-(\d{2})\s*-\s*/;
async function generateWorkingCopy(
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

  // Never guess which image belongs to which component. The renderer appends
  // the original PDF pages as source evidence, preserving their photo/table pairing.
  const itemPhotos: { photoBeforeKey?: string; photoAfterKey?: string }[] = [];

  const nameMatch = doc.originalName.match(FILE_NAME_DATE);
  const fallbackDate = nameMatch
    ? new Date(
        Number(nameMatch[1]),
        Number(nameMatch[2]) - 1,
        Number(nameMatch[3]),
      )
    : doc.uploadedAt;
  const extractedDate = parseReportDate(extracted.inspectionDate);
  const inspectionDate = extractedDate ?? fallbackDate;

  const existing = await prisma.progressReport.findUnique({
    where: { sourceDocumentId: documentId },
  });

  const report = await prisma.$transaction(async (tx) => {
    let r;
    if (existing) {
      await lockReport(tx, existing.id);
      await tx.progressReport.update({
        where: { id: existing.id },
        data: { sourceDocumentId: null, originalSourceDocumentId: documentId },
      });
    }
    {
      const number = await generateNumber(tx, "PROGRESS_REPORT");
      r = await tx.progressReport.create({
        data: {
          number,
          projectId,
          inspectionDate,
          dateVerified: Boolean(extractedDate),
          location: extracted.location,
          summary: extracted.summary,
          overallPercent: extracted.overallPercent,
          preparedById: actor.userId,
          createdById: actor.userId,
          sourceDocumentId: documentId,
          originalSourceDocumentId: documentId,
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
      description: `${existing ? "Membuat draf baru; versi lama dipertahankan" : "Membuat draf"} dari "${doc.originalName}" (${extracted.items.length} item, confidence: ${extracted.confidence})`,
    });
    return r;
  });

  revalidatePath(`/projects/${projectId}`);
  return { progressReportId: report.id };
}

export async function generateProgressReportForActor(documentId: string, projectId: string, actor: SessionPayload, force = false): Promise<{ progressReportId: string }> {
  requirePermission(actor.role, "project", "create");
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId, deletedAt: null }, include: { folder: true, progressReport: true } });
  if (doc.folder?.projectId !== projectId) throw new Error("Dokumen tidak berada di proyek ini.");
  if (doc.progressReport && !doc.progressReport.deletedAt && !force) return { progressReportId: doc.progressReport.id };
  const started = new Date();
  const claim = await prisma.document.updateMany({ where: { id: documentId, deletedAt: null, OR: [{ processingState: { not: "PROCESSING" } }, { processingStartedAt: { lt: new Date(Date.now() - 10 * 60000) } }] },
    data: { processingState: "PROCESSING", processingStartedAt: started, processingError: null } });
  if (!claim.count) throw new Error("Dokumen sedang diproses. Muat ulang sebentar lagi; jangan unggah ulang.");
  try {
    const result = await generateWorkingCopy(documentId, projectId, actor);
    await prisma.document.updateMany({ where: { id: documentId, processingStartedAt: started }, data: { processingState: "READY", processingError: null } });
    return result;
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : null;
    const message = status === 401 || status === 403
      ? "Akses layanan AI belum valid. Administrator perlu memperbarui kredensial AI. File asli tetap tersimpan; tidak perlu unggah ulang."
      : status === 429
        ? "Layanan AI sedang membatasi permintaan. Administrator perlu memeriksa kuota. File asli tetap tersimpan."
        : "Draf belum berhasil dibuat. File asli tetap tersimpan; gunakan Coba lagi. Jika berulang, hubungi administrator.";
    await prisma.document.updateMany({ where: { id: documentId, processingStartedAt: started }, data: { processingState: "FAILED", processingError: message } });
    // Provider responses may contain internal request details; return only a safe, actionable message.
    throw new Error(message);
  }
}
