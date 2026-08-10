"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { taskSchema, milestoneSchema, expenseSchema } from "@/lib/validation/project";
import { generateNumber } from "@/lib/numbering";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { submitExpenseForApproval, approveExpense, rejectExpense } from "@/lib/workflows/expense";
import type { TaskStatus } from "@prisma/client";

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = taskSchema.parse(input);
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.projectTask.create({ data: { ...data, createdById: actor.userId } });
      await logActivity(tx, { userId: actor.userId, action: "CREATE", entityType: "PROJECT_TASK", entityId: created.id, description: `Added task "${created.title}"` });
      return created;
    });
    revalidatePath(`/projects/${data.projectId}`);
    return { id: task.id };
  });
}

export async function updateTaskStatus(id: string, projectId: string, status: TaskStatus): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    const progressPercent = status === "COMPLETED" ? 100 : status === "TODO" ? 0 : undefined;
    await prisma.$transaction(async (tx) => {
      await tx.projectTask.update({ where: { id }, data: { status, ...(progressPercent !== undefined ? { progressPercent } : {}) } });
      await logActivity(tx, { userId: actor.userId, action: "STATUS_CHANGE", entityType: "PROJECT_TASK", entityId: id, description: `Task -> ${status}` });
    });
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

export async function createMilestone(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = milestoneSchema.parse(input);
    const milestone = await prisma.$transaction(async (tx) => {
      const created = await tx.projectMilestone.create({ data });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "PROJECT_MILESTONE", entityId: created.id,
        description: `Added milestone "${created.name}"`,
      });
      return created;
    });
    revalidatePath(`/projects/${data.projectId}`);
    return { id: milestone.id };
  });
}

export async function updateMilestoneStatus(
  id: string,
  projectId: string,
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "DELAYED"
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    const progressPercent = status === "COMPLETED" ? 100 : undefined;
    // completedAt feeds the "Realisasi" line on the S-Curve — stamp it the
    // moment a milestone is actually marked done, and clear it if someone
    // reopens the milestone by mistake (status moved away from COMPLETED),
    // so the S-Curve never counts un-done work as delivered.
    const completedAt = status === "COMPLETED" ? new Date() : null;
    await prisma.$transaction(async (tx) => {
      await tx.projectMilestone.update({
        where: { id },
        data: { status, completedAt, ...(progressPercent !== undefined ? { progressPercent } : {}) },
      });
      await logActivity(tx, { userId: actor.userId, action: "STATUS_CHANGE", entityType: "PROJECT_MILESTONE", entityId: id, description: `Milestone -> ${status}` });
    });
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

export async function createExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "create");
    const data = expenseSchema.parse(input);
    const total = data.amount + data.tax;

    const expense = await prisma.$transaction(async (tx) => {
      const number = await generateNumber(tx, "EXPENSE");
      const created = await tx.projectExpense.create({
        data: { ...data, total, number, createdById: actor.userId },
      });
      await logActivity(tx, { userId: actor.userId, action: "CREATE", entityType: "PROJECT_EXPENSE", entityId: created.id, description: `Recorded expense ${created.number} (${created.category})` });
      return created;
    });

    revalidatePath(`/projects/${data.projectId}`);
    return { id: expense.id };
  });
}

export async function submitExpenseAction(id: string, projectId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "project", "update");
    await submitExpenseForApproval(id, actor);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

export async function approveExpenseAction(id: string, projectId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await approveExpense(id, actor);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}

export async function rejectExpenseAction(id: string, projectId: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    await rejectExpense(id, reason, actor);
    revalidatePath(`/projects/${projectId}`);
    return { id };
  });
}
