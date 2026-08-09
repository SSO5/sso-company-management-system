"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { generateNumber } from "@/lib/numbering";
import { logActivity } from "@/lib/workflows/audit";
import { createOpportunityFolders } from "@/lib/workflows/folders";
import { opportunitySchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import type { OpportunityStatus } from "@prisma/client";

export async function listOpportunities() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.opportunity.findMany({
    where: { deletedAt: null },
    include: {
      customer: { select: { companyName: true } },
      salesPic: { select: { name: true } },
      folders: { where: { parentId: null }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOpportunityDetail(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id },
    include: {
      customer: { select: { id: true, companyName: true, number: true } },
      contact: { select: { id: true, name: true, position: true, email: true, phone: true } },
      salesPic: { select: { name: true } },
      quotations: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, revision: true, status: true, grandTotal: true } },
      projects: { select: { id: true, number: true } },
    },
  });
  const rootFolder = await prisma.folder.findFirst({ where: { opportunityId: id, parentId: null } });
  const folders = rootFolder
    ? await prisma.folder.findMany({ where: { parentId: rootFolder.id }, orderBy: { name: "asc" } })
    : [];
  return { opportunity, folders };
}

export async function createOpportunity(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = opportunitySchema.parse(input);

    const opp = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "OPPORTUNITY");
      const created = await tx.opportunity.create({
        data: { ...data, number },
        include: { customer: { select: { companyName: true } } },
      });

      // Pre-Won documents (draft quotations, technical notes, correspondence)
      // need a home from day one — don't wait for the deal to be Won.
      await createOpportunityFolders(tx, created, created.customer.companyName);

      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "OPPORTUNITY",
        entityId: created.id,
        description: `Created opportunity ${created.number} - ${created.name}`,
      });
      return created;
    });

    revalidatePath("/sales/opportunities");
    return { id: opp.id };
  });
}

export async function updateOpportunityStage(
  id: string,
  status: OpportunityStatus
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");

    await prisma.$transaction(async (tx) => {
      const before = await tx.opportunity.findUniqueOrThrow({ where: { id } });
      await tx.opportunity.update({ where: { id }, data: { status } });
      await logActivity(tx, {
        userId: actor.userId,
        action: "STATUS_CHANGE",
        entityType: "OPPORTUNITY",
        entityId: id,
        description: `${before.number}: ${before.status} -> ${status}`,
      });
    });

    revalidatePath("/sales/opportunities");
    return { id };
  });
}
