"use server";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { runAction, type ActionResult } from "@/lib/action-helpers";

/**
 * The Notification table has existed since the first schema, and workflow code
 * has been writing rows to it — but nothing ever read them back. Every
 * approval request, overdue warning and import summary written so far went
 * into a table no screen displayed, which is worse than not having
 * notifications: the code looks like it informs people, and nobody is
 * informed.
 *
 * This is the read side. Kept deliberately small — a list, an unread count,
 * and mark-as-read — because a notification centre that grows features is a
 * notification centre people stop opening.
 */

export async function getMyNotifications(limit = 12) {
  const actor = await requireUserOrThrow();
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: actor.userId },
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.notification.count({ where: { userId: actor.userId, isRead: false } }),
  ]);
  return { items, unreadCount };
}

/**
 * Just the count — used by the topbar bell, which renders on every single
 * page (not just /dashboard), so it deliberately doesn't pull the full
 * getMyNotifications() list on every navigation.
 *
 * Cached for a short window (perf: this app's DB round-trip is expensive —
 * Neon in a different region from Vercel's default function region, see
 * lib/db.ts — and since the layout that calls this wraps EVERY route, an
 * uncached query here was paying that cost on every single navigation, not
 * just page loads that actually need fresh data. A badge count doesn't need
 * per-request precision; a mark-as-read explicitly revalidates it below.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const actor = await requireUserOrThrow();
  return getCachedUnreadCount(actor.userId);
}

const getCachedUnreadCount = unstable_cache(
  (userId: string) => prisma.notification.count({ where: { userId, isRead: false } }),
  ["unread-notification-count"],
  { revalidate: 20, tags: ["unread-notification-count"] }
);

export async function markAllNotificationsRead(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const res = await prisma.notification.updateMany({
      where: { userId: actor.userId, isRead: false },
      data: { isRead: true },
    });
    revalidatePath("/dashboard");
    revalidateTag("unread-notification-count");
    return { count: res.count };
  });
}

export async function markNotificationRead(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    // Scoped by userId as well as id: without it, any signed-in user could
    // mark another person's notification read by guessing an id.
    await prisma.notification.updateMany({
      where: { id, userId: actor.userId },
      data: { isRead: true },
    });
    revalidatePath("/dashboard");
    revalidateTag("unread-notification-count");
    return { id };
  });
}
