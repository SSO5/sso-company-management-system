import type { Prisma, UserRole } from "@prisma/client";

/**
 * In-app notifications (spec section 35). Stored in the database and
 * surfaced in the notification bell / dashboard alerts. Outbound
 * email/WhatsApp delivery is intentionally NOT faked here — see
 * EMAIL_PROVIDER_API_KEY / WHATSAPP_PROVIDER_API_KEY in .env.example. Once
 * those credentials exist, hook a dispatch call at the bottom of
 * notifyUser()/notifyRole() rather than pretending delivery already happens.
 */
export async function notifyUser(
  tx: Prisma.TransactionClient,
  params: { userId: string; type: string; title: string; message: string; link?: string }
) {
  await tx.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    },
  });
}

export async function notifyRole(
  tx: Prisma.TransactionClient,
  role: UserRole,
  params: { type: string; title: string; message: string; link?: string }
) {
  const users = await tx.user.findMany({ where: { role, isActive: true }, select: { id: true } });
  if (users.length === 0) return;
  await tx.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    })),
  });
}
