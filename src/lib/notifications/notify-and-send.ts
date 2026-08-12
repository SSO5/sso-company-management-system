import { prisma } from "@/lib/db";
import { dispatchOutbound, type OutboundTarget } from "@/lib/notifications/dispatch";

/**
 * Writes the in-app notification AND sends it out over WhatsApp/email, in one
 * call.
 *
 * These two were separate for a long time and quietly drifted apart:
 * workflows/notify.ts created Notification rows with a comment saying "hook a
 * dispatch call here once credentials exist" — which never happened. The
 * result is a system that looks like it notifies people. Rows accumulate, the
 * dashboard shows them, and not one message ever leaves the building. Anyone
 * not in the habit of opening the app is simply never told.
 *
 * Keeping both behind a single function is the fix: there is no longer a way
 * to write a notification and forget to send it, because there is no separate
 * "write" to call.
 *
 * MUST be called AFTER any surrounding transaction has committed. It makes two
 * external HTTP calls per recipient, and dispatch.ts documents why those can
 * never sit inside an interactive Prisma transaction against a remote database.
 */
export async function notifyAndSend(
  target: OutboundTarget,
  payload: { type: string; title: string; message: string; link?: string }
): Promise<{ recipients: number }> {
  const where = target.allActive
    ? { isActive: true }
    : target.userIds?.length
    ? { id: { in: target.userIds }, isActive: true }
    : target.userId
    ? { id: target.userId, isActive: true }
    : target.role
    ? { role: target.role, isActive: true }
    : null;

  if (!where) return { recipients: 0 };

  const users = await prisma.user.findMany({ where, select: { id: true } });
  if (users.length === 0) return { recipients: 0 };

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
    })),
  });

  // Best-effort: the in-app record is already saved, so a WhatsApp outage must
  // never make the caller think the notification failed.
  await dispatchOutbound(target, { title: payload.title, message: payload.message, link: payload.link });

  return { recipients: users.length };
}
