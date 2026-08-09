"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { customerSchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";

export async function listCustomers(query?: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.customer.findMany({
    where: {
      deletedAt: null,
      ...(query
        ? { OR: [{ companyName: { contains: query, mode: "insensitive" } }, { number: { contains: query, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { opportunities: true, quotations: true, projects: true } } },
  });
}

export async function getCustomer360(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.customer.findUniqueOrThrow({
    where: { id },
    include: {
      contacts: true,
      opportunities: { orderBy: { createdAt: "desc" } },
      quotations: { orderBy: { createdAt: "desc" } },
      purchaseOrders: { orderBy: { createdAt: "desc" } },
      contracts: { orderBy: { createdAt: "desc" } },
      projects: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" }, include: { payments: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function createCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = customerSchema.parse(input);

    const customer = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "CUSTOMER");
      const created = await tx.customer.create({
        data: { ...data, email: data.email || null, number, createdById: actor.userId },
      });
      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "CUSTOMER",
        entityId: created.id,
        description: `Created customer ${created.number} - ${created.companyName}`,
      });
      return created;
    });

    revalidatePath("/sales/customers");
    return { id: customer.id };
  });
}

export async function updateCustomer(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const data = customerSchema.partial().parse(input);

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { ...data, email: data.email || undefined } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "UPDATE",
        entityType: "CUSTOMER",
        entityId: id,
        description: `Updated customer ${id}`,
      });
    });

    revalidatePath("/sales/customers");
    revalidatePath(`/sales/customers/${id}`);
    return { id };
  });
}

export async function deleteCustomer(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "delete");

    // Soft delete only (section 47/48): customers with transaction history
    // must never be physically deleted.
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.userId } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "DELETE",
        entityType: "CUSTOMER",
        entityId: id,
        description: `Soft-deleted customer ${id}`,
      });
    });

    revalidatePath("/sales/customers");
    return { id };
  });
}
