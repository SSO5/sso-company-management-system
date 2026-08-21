"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { quotationSchema } from "@/lib/validation/sales";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import {
  createQuotation,
  updateQuotation,
  reviseQuotation,
  deleteQuotation,
  submitQuotationForApproval,
  approveQuotation,
  rejectQuotation,
  markQuotationSent,
  markQuotationWon,
  markQuotationLost,
} from "@/lib/workflows/quotation";

export async function listQuotations() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.quotation.findMany({
    where: { deletedAt: null },
    include: { customer: { select: { companyName: true } }, salesPic: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuotation(id: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.quotation.findFirstOrThrow({
    where: { id, deletedAt: null },
    include: {
      customer: true, contact: true, opportunity: true, items: { orderBy: { sortOrder: "asc" } },
      salesPic: { select: { name: true } }, createdBy: { select: { name: true } },
      submittedBy: { select: { name: true } }, approvedBy: { select: { name: true } },
      project: true,
    },
  });
}

/** Read-only "Riwayat Revisi" (revision history) — see revision-history.ts for how these snapshots are captured. */
export async function getQuotationRevisionHistory(quotationId: string) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "sales", "view");
  return prisma.quotationRevisionHistory.findMany({
    where: { quotationId },
    orderBy: { revision: "desc" },
  });
}

export async function createQuotationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "create");
    const data = quotationSchema.parse(input);
    const quotation = await createQuotation(data, actor);
    revalidatePath("/sales/quotations");
    return { id: quotation.id };
  });
}

export async function updateQuotationAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const data = quotationSchema.parse(input);
    const quotation = await updateQuotation(id, data, actor);
    revalidatePath(`/sales/quotations/${id}`);
    revalidatePath("/sales/quotations");
    return { id: quotation.id };
  });
}

export async function reviseQuotationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    const quotation = await reviseQuotation(id, actor);
    revalidatePath(`/sales/quotations/${id}`);
    revalidatePath("/sales/quotations");
    return { id: quotation.id };
  });
}

export async function submitQuotationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    await submitQuotationForApproval(id, actor);
    revalidatePath(`/sales/quotations/${id}`);
    return { id };
  });
}

export async function approveQuotationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await approveQuotation(id, actor);
    revalidatePath(`/sales/quotations/${id}`);
    return { id };
  });
}

export async function rejectQuotationAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await rejectQuotation(id, reason, actor);
    revalidatePath(`/sales/quotations/${id}`);
    return { id };
  });
}

export async function sendQuotationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    await markQuotationSent(id, actor);
    revalidatePath(`/sales/quotations/${id}`);
    return { id };
  });
}

export async function markWonAction(
  id: string,
  projectManagerId?: string
): Promise<ActionResult<{ id: string; projectId: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const { project } = await markQuotationWon(id, actor, { projectManagerId });
    revalidatePath(`/sales/quotations/${id}`);
    revalidatePath("/projects");
    return { id, projectId: project.id };
  });
}

export async function deleteQuotationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    await deleteQuotation(id, actor);
    revalidatePath("/sales/quotations");
    revalidatePath("/sales/opportunities");
    revalidatePath("/documents");
    return { id };
  });
}

export async function markLostAction(id: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "sales", "update");
    await markQuotationLost(id, reason, actor);
    revalidatePath(`/sales/quotations/${id}`);
    return { id };
  });
}
