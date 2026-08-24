"use server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requireDirectiveGiver, ForbiddenError } from "@/lib/permissions";
import { logActivity } from "@/lib/workflows/audit";
import { notifyUser } from "@/lib/workflows/notify";
import { dispatchOutbound } from "@/lib/notifications/dispatch";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import type { UserRole } from "@prisma/client";

const directiveTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("USER"), userId: z.string().min(1) }),
  z.object({ type: z.literal("ROLE"), role: z.enum(["SALES", "FINANCE", "PROJECT_MANAGER"]) }),
  z.object({ type: z.literal("ALL") }),
]);

const createDirectiveSchema = z.object({
  title: z.string().min(2, "Judul tugas wajib diisi."),
  description: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  target: directiveTargetSchema,
});

/** Users ADMIN can pick as a single-recipient target — everyone active except themselves. */
export async function listAssignableUsersAction() {
  const actor = await requireUserOrThrow();
  requireDirectiveGiver(actor.role);
  return prisma.user.findMany({
    where: { isActive: true, id: { not: actor.userId } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Gives a task/reminder to one or more employees through the system —
 * ADMIN (Direktur) only. Never writes one shared row: every resolved
 * recipient gets their own Directive (own OPEN/DONE status), all carrying
 * the same batchId so listGivenDirectivesAction can group them back into
 * one card while still showing exactly who has/hasn't completed it.
 */
export async function createDirectiveAction(input: unknown): Promise<ActionResult<{ batchId: string; recipientCount: number }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requireDirectiveGiver(actor.role);
    const data = createDirectiveSchema.parse(input);

    const where =
      data.target.type === "USER"
        ? { id: data.target.userId, isActive: true }
        : data.target.type === "ROLE"
        ? { role: data.target.role as UserRole, isActive: true }
        : { isActive: true, id: { not: actor.userId } };

    const recipients = await prisma.user.findMany({ where, select: { id: true } });
    if (recipients.length === 0) {
      throw new Error("Tidak ada user aktif yang cocok dengan target ini.");
    }

    const batchId = randomUUID();

    // Created one-by-one (not createMany) so each row's own id is known
    // right away — needed to deep-link each recipient's in-app notification
    // straight to THEIR task instead of the generic /tasks list. WA/email is
    // deliberately NOT sent here at all: firing every recipient's outbound
    // notification in the same instant is exactly the burst pattern that
    // gets a WhatsApp number flagged/blocked. It's picked up instead by
    // dispatchPendingDirectiveNotifications() (cron-jobs.ts), which drains
    // rows with notifiedAt still null a few at a time, spread across a
    // frequent cron — see api/cron/directives.
    await prisma.$transaction(async (tx) => {
      for (const r of recipients) {
        const row = await tx.directive.create({
          data: {
            batchId,
            title: data.title,
            description: data.description || null,
            dueDate: data.dueDate || null,
            assignedToId: r.id,
            assignedById: actor.userId,
          },
          select: { id: true },
        });
        await notifyUser(tx, {
          userId: r.id,
          type: "DIRECTIVE_ASSIGNED",
          title: "Tugas baru dari Direktur",
          message: data.title,
          link: `/tasks?open=${row.id}`,
        });
      }
      await logActivity(tx, {
        userId: actor.userId,
        action: "CREATE",
        entityType: "DIRECTIVE",
        entityId: batchId,
        description: `Memberi tugas "${data.title}" ke ${recipients.length} user (${data.target.type})`,
      });
    });

    revalidatePath("/tasks");
    return { batchId, recipientCount: recipients.length };
  });
}

/** Every task assigned TO the caller, open ones first. */
export async function listMyDirectivesAction() {
  const actor = await requireUserOrThrow();
  const rows = await prisma.directive.findMany({
    where: { assignedToId: actor.userId },
    include: { assignedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.sort((a, b) => (a.status === b.status ? 0 : a.status === "OPEN" ? -1 : 1));
}

/** Marks one of the caller's own tasks done (ADMIN can also close any task, e.g. on someone's behalf). */
export async function completeDirectiveAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const existing = await prisma.directive.findUniqueOrThrow({ where: { id } });
    if (existing.assignedToId !== actor.userId && actor.role !== "ADMIN") {
      throw new ForbiddenError("Anda hanya bisa menandai tugas milik sendiri sebagai selesai.");
    }
    if (existing.status === "DONE") return { id };

    await prisma.$transaction(async (tx) => {
      await tx.directive.update({ where: { id }, data: { status: "DONE", completedAt: new Date() } });
      if (existing.assignedById !== actor.userId) {
        await notifyUser(tx, {
          userId: existing.assignedById,
          type: "DIRECTIVE_COMPLETED",
          title: "Tugas selesai",
          message: `Tugas "${existing.title}" telah ditandai selesai.`,
          link: `/tasks?tab=given&batch=${existing.batchId}`,
        });
      }
    });

    revalidatePath("/tasks");
    return { id };
  });
}

/**
 * Free-text reply to a task/reminder — e.g. answering "sudah cek tugas
 * Anda? ada kendala apa?" with the actual obstacle. Deliberately independent
 * of status: replying doesn't mark the task DONE, and the giver (Direktur)
 * gets notified through the system, same channel as the original ask.
 */
const respondSchema = z.object({ response: z.string().min(1, "Balasan tidak boleh kosong.").max(2000) });

export async function respondToDirectiveAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const existing = await prisma.directive.findUniqueOrThrow({ where: { id } });
    if (existing.assignedToId !== actor.userId) {
      throw new ForbiddenError("Anda hanya bisa membalas tugas milik sendiri.");
    }
    const { response } = respondSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      await tx.directive.update({ where: { id }, data: { response, respondedAt: new Date() } });
      await notifyUser(tx, {
        userId: existing.assignedById,
        type: "DIRECTIVE_RESPONDED",
        title: "Balasan tugas dari karyawan",
        message: `${actor.name} membalas "${existing.title}": ${response}`,
        link: `/tasks?tab=given&batch=${existing.batchId}`,
      });
    });

    await dispatchOutbound(
      { userId: existing.assignedById },
      {
        title: "Balasan tugas dari karyawan",
        message: `${actor.name} membalas "${existing.title}":\n${response}`,
        link: `/tasks?tab=given&batch=${existing.batchId}`,
      }
    ).catch((err) => console.error("[respondToDirectiveAction] dispatchOutbound failed:", err));

    revalidatePath("/tasks");
    return { id };
  });
}

/** ADMIN's own "tugas yang saya berikan" — grouped by batch, one row per recipient with their status. */
export async function listGivenDirectivesAction() {
  const actor = await requireUserOrThrow();
  requireDirectiveGiver(actor.role);

  const rows = await prisma.directive.findMany({
    where: { assignedById: actor.userId },
    include: { assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  interface Batch {
    batchId: string;
    title: string;
    description: string | null;
    dueDate: Date | null;
    createdAt: Date;
    recipients: { name: string; status: string; completedAt: Date | null; response: string | null; respondedAt: Date | null }[];
  }
  const batches = new Map<string, Batch>();
  for (const row of rows) {
    const recipient = {
      name: row.assignedTo.name,
      status: row.status,
      completedAt: row.completedAt,
      response: row.response,
      respondedAt: row.respondedAt,
    };
    const existing = batches.get(row.batchId);
    if (existing) {
      existing.recipients.push(recipient);
    } else {
      batches.set(row.batchId, {
        batchId: row.batchId,
        title: row.title,
        description: row.description,
        dueDate: row.dueDate,
        createdAt: row.createdAt,
        recipients: [recipient],
      });
    }
  }
  return Array.from(batches.values());
}
