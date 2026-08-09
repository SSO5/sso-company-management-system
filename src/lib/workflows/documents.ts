import { prisma } from "@/lib/db";
import { getStorageDriver, assertFileAllowed, sanitizeFileName } from "@/lib/storage";
import { resolveDestinationFolder } from "@/lib/workflows/folders";
import { logActivity } from "@/lib/workflows/audit";
import type { SessionPayload } from "@/lib/auth/session";

export interface UploadDocumentParams {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  description?: string;
  folderId?: string; // explicit target (e.g. company folders); omit to auto-route
  projectId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

/** Upload + auto-route (spec sections 23-26, 40). */
export async function uploadDocument(params: UploadDocumentParams, actor: SessionPayload) {
  assertFileAllowed(params.originalName, params.mimeType, params.buffer.byteLength);

  const driver = getStorageDriver();
  const stored = await driver.save(params.buffer, {
    originalName: params.originalName,
    mimeType: params.mimeType,
  });

  return prisma.$transaction(async (tx) => {
    const folderId =
      params.folderId ??
      (await resolveDestinationFolder(tx, {
        projectId: params.projectId,
        relatedEntityType: params.relatedEntityType,
      }));

    const doc = await tx.document.create({
      data: {
        fileName: sanitizeFileName(params.originalName),
        originalName: params.originalName,
        mimeType: params.mimeType,
        fileSize: stored.fileSize,
        storagePath: stored.storageKey,
        folderId,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        uploadedById: actor.userId,
        description: params.description,
      },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "UPLOAD",
      entityType: params.relatedEntityType || "DOCUMENT",
      entityId: params.relatedEntityId || doc.id,
      description: `Uploaded "${params.originalName}"`,
      metadata: { documentId: doc.id, folderId },
    });

    return doc;
  });
}

/** Soft delete -> Trash (spec section 41). */
export async function moveDocumentToTrash(documentId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date(), deletedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "DELETE",
      entityType: "DOCUMENT",
      entityId: doc.id,
      description: `Moved "${doc.originalName}" to Trash`,
    });
    return doc;
  });
}

export async function restoreDocumentFromTrash(documentId: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id: documentId },
      data: { deletedAt: null, deletedById: null },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "RESTORE",
      entityType: "DOCUMENT",
      entityId: doc.id,
      description: `Restored "${doc.originalName}" from Trash`,
    });
    return doc;
  });
}

export async function permanentlyDeleteDocument(documentId: string, actor: SessionPayload) {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  if (!doc.deletedAt) {
    throw new Error("Only documents already in Trash can be permanently deleted.");
  }
  const driver = getStorageDriver();
  await driver.delete(doc.storagePath);
  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: documentId } });
    await logActivity(tx, {
      userId: actor.userId,
      action: "DELETE",
      entityType: "DOCUMENT",
      entityId: documentId,
      description: `Permanently deleted "${doc.originalName}"`,
    });
  });
}
