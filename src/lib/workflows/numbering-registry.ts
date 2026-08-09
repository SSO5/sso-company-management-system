import { prisma } from "@/lib/db";
import { generateRegistryNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import type { NumberRegistryInput } from "@/lib/validation/numbering";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Issues a number immediately (spec: "ambil nomor dulu" before drafting any
 * document — surat, quotation, invoice, BAST, etc.). Uses its own dedicated
 * sequence pool (generateRegistryNumber, keyed by docTypeCode+year) so
 * numbers taken here are guaranteed unique and sequential within this
 * registry, independent from the automatic numbering on Quotation/Invoice/
 * Costing entity creation elsewhere in the app.
 */
export async function createNumberRegistryEntry(input: NumberRegistryInput, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const number = await generateRegistryNumber(tx, input.docTypeCode, input.deptCode, input.numberDate);
    const entry = await tx.numberRegistryEntry.create({
      data: {
        docTypeCode: input.docTypeCode,
        deptCode: input.deptCode,
        number,
        numberDate: input.numberDate,
        subject: input.subject,
        picName: input.picName,
        createdById: actor.userId,
      },
    });

    await logActivity(tx, {
      userId: actor.userId,
      action: "CREATE",
      entityType: "NUMBER_REGISTRY",
      entityId: entry.id,
      description: `Generated number ${entry.number} for "${entry.subject}"`,
    });

    return entry;
  });
}

/** Marks an entry cancelled for display purposes. The number itself is
 * never reused or re-issued — burned numbers stay burned (spec: never skip
 * or double-issue a document number). */
export async function voidNumberRegistryEntry(id: string, actor: SessionPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.numberRegistryEntry.findUniqueOrThrow({ where: { id } });
    if (existing.createdById !== actor.userId && actor.role !== "ADMIN") {
      throw new Error("Only the person who took this number or an Admin can void it.");
    }
    const entry = await tx.numberRegistryEntry.update({
      where: { id },
      data: { voidedAt: new Date(), voidedById: actor.userId },
    });
    await logActivity(tx, {
      userId: actor.userId,
      action: "DELETE",
      entityType: "NUMBER_REGISTRY",
      entityId: entry.id,
      description: `Voided number ${entry.number}`,
    });
    return entry;
  });
}
