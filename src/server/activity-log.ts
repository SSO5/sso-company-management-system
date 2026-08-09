"use server";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";

export async function listActivityLog(limit = 100) {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "activityLog", "view");
  return prisma.activityLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
