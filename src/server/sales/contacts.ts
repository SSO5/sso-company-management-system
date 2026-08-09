"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { contactSchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function listContacts(customerId?: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.contact.findMany({
    where: customerId ? { customerId } : undefined,
    include: { customer: { select: { companyName: true, number: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createContact(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = contactSchema.parse(input);

    const contact = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.contact.updateMany({ where: { customerId: data.customerId }, data: { isPrimary: false } });
      }
      const created = await tx.contact.create({ data: { ...data, email: data.email || null } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "CONTACT",
        entityId: created.id,
        description: `Added contact ${created.name} to customer ${data.customerId}`,
      });
      return created;
    });

    revalidatePath("/sales/contacts");
    revalidatePath(`/sales/customers/${data.customerId}`);
    return { id: contact.id };
  });
}

export async function deleteContact(id: string, customerId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "delete");
    await prisma.contact.delete({ where: { id } });
    revalidatePath("/sales/contacts");
    revalidatePath(`/sales/customers/${customerId}`);
    return { id };
  });
}
