"use server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { getStorageDriver } from "@/lib/storage";
import { runAction } from "@/lib/action-helpers";
import { logActivity } from "@/lib/workflows/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Each request is limited to one displayed group. No age/name-based deletion.
export async function cleanExactDuplicates(input: unknown) {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "documents", "delete");
    const ids = z.array(z.string().min(1)).min(2).max(20).parse(input);
    const docs = await prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
    });
    if (docs.length < 2)
      throw new Error("Kelompok sudah berubah. Muat ulang daftar.");
    const first = docs[0];
    if (
      docs.some(
        (d) =>
          d.folderId !== first.folderId ||
          d.originalName !== first.originalName ||
          d.fileSize !== first.fileSize,
      )
    )
      throw new Error("Dokumen harus berasal dari kelompok yang sama.");
    if (docs.reduce((s, d) => s + d.fileSize, 0) > 60 * 1024 * 1024)
      throw new Error("Kelompok terlalu besar. Periksa dokumen satu per satu.");
    const hashes = new Map<string, string>();
    for (const doc of docs) {
      const bytes = await getStorageDriver().read(doc.storagePath);
      if (bytes.length !== doc.fileSize)
        throw new Error(
          "Ukuran file tidak sesuai catatan. Pembersihan dibatalkan.",
        );
      hashes.set(doc.id, createHash("sha256").update(bytes).digest("hex"));
    }
    const removed = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9142027)`;
        // Lock candidates while checking evidence references and processing claims.
        for (const d of docs)
          await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${d.id} FOR UPDATE`;
        const current = await tx.document.findMany({
          where: { id: { in: ids }, deletedAt: null },
          orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
        });
        if (
          current.some((d) => {
            const before = docs.find((x) => x.id === d.id);
            return (
              !before ||
              d.storagePath !== before.storagePath ||
              d.fileSize !== before.fileSize ||
              d.folderId !== before.folderId ||
              d.originalName !== before.originalName
            );
          })
        )
          throw new Error(
            "Dokumen berubah selama pemeriksaan. Muat ulang sebelum membersihkan.",
          );
        const reports = await tx.progressReport.findMany({
          where: {
            OR: [
              { sourceDocumentId: { in: ids } },
              { originalSourceDocumentId: { in: ids } },
            ],
          },
          select: { sourceDocumentId: true, originalSourceDocumentId: true },
        });
        const bank = await tx.financeBankBalance.findMany({
          where: { sourceDocumentId: { in: ids } },
          select: { sourceDocumentId: true },
        });
        const protectedIds = new Set([
          ...reports.flatMap((r) => [
            r.sourceDocumentId,
            r.originalSourceDocumentId,
          ]),
          ...bank.map((b) => b.sourceDocumentId),
        ]);
        const protectedDoc = (d: typeof first) =>
          Boolean(
            d.relatedEntityType ||
              d.relatedEntityId ||
              d.description?.trim() ||
              d.processingState !== "IDLE" ||
              protectedIds.has(d.id),
          );
        const kept = new Map<string, string>();
        // Evidence-linked copies always take precedence, and are never removed.
        for (const d of current.filter(protectedDoc)) {
          const hash = hashes.get(d.id);
          if (hash) kept.set(hash, d.id);
        }
        let count = 0;
        for (const d of current) {
          const before = docs.find((x) => x.id === d.id);
          if (
            !before ||
            d.storagePath !== before.storagePath ||
            d.fileSize !== before.fileSize ||
            d.folderId !== before.folderId ||
            d.originalName !== before.originalName
          )
            continue;
          const hash = hashes.get(d.id)!;
          if (protectedDoc(d)) continue;
          const keeper = kept.get(hash);
          if (!keeper) {
            kept.set(hash, d.id);
            continue;
          }
          await tx.document.update({
            where: { id: d.id },
            data: { deletedAt: new Date(), deletedById: actor.userId },
          });
          await logActivity(tx, {
            userId: actor.userId,
            action: "DELETE",
            entityType: "DOCUMENT",
            entityId: d.id,
            description: `Duplikat identik dipindahkan ke Sampah; salinan ${keeper} dipertahankan. SHA-256 ${hash}.`,
          });
          count++;
        }
        return count;
      },
      { timeout: 20000 },
    );
    revalidatePath("/data");
    revalidatePath("/data/review");
    revalidatePath("/documents/trash");
    if (first.folderId) revalidatePath(`/documents/${first.folderId}`);
    return { removed };
  });
}
