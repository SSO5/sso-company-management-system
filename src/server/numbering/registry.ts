"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { numberRegistrySchema, quotationIntakeSchema } from "@/lib/validation/numbering";
import { requirePermission } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { createNumberRegistryEntry, voidNumberRegistryEntry } from "@/lib/workflows/numbering-registry";
import { createQuotationIntake } from "@/lib/workflows/quotation-intake";

/** Anyone signed in can take a number — this is a low-risk, everyday action
 * (matches the real workflow: whoever is about to send a quotation or
 * letter grabs a number first), so it isn't gated behind a module permission. */
export async function listNumberRegistryEntries() {
  await requireUserOrThrow();
  return prisma.numberRegistryEntry.findMany({
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createNumberRegistryEntryAction(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const data = numberRegistrySchema.parse(input);
    const entry = await createNumberRegistryEntry(data, actor);
    revalidatePath("/numbering");
    return { id: entry.id, number: entry.number };
  });
}

export async function voidNumberRegistryEntryAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await voidNumberRegistryEntry(id, actor);
    revalidatePath("/numbering");
    return { id };
  });
}

/** "Ambil Nomor" for Quotation specifically — see createQuotationIntake. */
export async function createQuotationIntakeAction(
  input: unknown
): Promise<ActionResult<{ opportunityId: string; opportunityNumber: string; customerName: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = quotationIntakeSchema.parse(input);
    const result = await createQuotationIntake(data, actor);
    revalidatePath("/sales/opportunities");
    revalidatePath("/documents");
    return {
      opportunityId: result.opportunityId,
      opportunityNumber: result.opportunityNumber,
      customerName: result.customerName,
    };
  });
}
