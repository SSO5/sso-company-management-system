"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { logActivity } from "@/lib/workflows/audit";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { assertFileAllowed, saveBrandingAsset } from "@/lib/storage";
import { whatsappNumberSchema } from "@/lib/validation/auth";
import { testWhatsAppConnection } from "@/lib/notifications/whatsapp";
import { z } from "zod";

/** "Profil Saya" — every signed-in user can read and edit their OWN name,
 * title, and WhatsApp number, and upload their own avatar, without needing
 * the Admin-only "users" permission that gates editing OTHER people's
 * accounts (updateUserAction in server/settings/users.ts). Role, email, and
 * active status stay off-limits here — those remain an Admin decision. */
export async function getOwnProfile() {
  const actor = await requireUserOrThrow();
  return prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { id: true, name: true, email: true, role: true, title: true, whatsappNumber: true, avatarUrl: true, createdAt: true },
  });
}

const ownProfileSchema = z.object({
  name: z.string().min(2, "Nama wajib diisi."),
  title: z.string().optional().nullable(),
  whatsappNumber: whatsappNumberSchema,
});

export async function updateOwnProfileAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();

    const data = ownProfileSchema.parse({
      name: formData.get("name"),
      title: formData.get("title") || null,
      whatsappNumber: formData.get("whatsappNumber") || null,
    });

    let avatarUrl: string | undefined;
    const file = formData.get("avatar");
    if (file instanceof File && file.size > 0) {
      assertFileAllowed(file.name, file.type, file.size);
      const buffer = Buffer.from(await file.arrayBuffer());
      avatarUrl = await saveBrandingAsset(buffer, { prefix: `avatar-${actor.userId}`, originalName: file.name });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.userId },
        data: {
          name: data.name,
          title: data.title || null,
          whatsappNumber: data.whatsappNumber,
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      });
      await logActivity(tx, {
        userId: actor.userId, action: "UPDATE", entityType: "USER", entityId: actor.userId,
        description: `${data.name} memperbarui profil sendiri${avatarUrl ? " (foto baru diupload)" : ""}`,
      });
    });

    // Session cookie carries name/email/role only (see session.ts's
    // SessionPayload) — those aren't editable here, so no re-issue needed.
    // Sidebar/topbar/dashboard all read the fresh row on the next request.
    revalidatePath("/settings/profile");
    revalidatePath("/dashboard");
    revalidatePath("/", "layout");
    return { id: actor.userId };
  });
}

/**
 * Self-service diagnostic for "I never get WhatsApp notifications, I don't
 * know why" — sends one real test message to the caller's OWN saved
 * whatsappNumber via Fonnte and reports back exactly why it failed (env var
 * missing, bad token, disconnected Fonnte device) instead of a silent
 * boolean, so a non-technical admin can self-diagnose without reading a
 * server log they don't have access to.
 */
export async function sendTestWhatsAppNotificationAction(): Promise<ActionResult<{ reason: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true, whatsappNumber: true },
    });
    if (!user.whatsappNumber) {
      throw new Error("Nomor WhatsApp Anda belum diisi — isi dulu nomornya di atas dan klik \"Simpan Profil\", baru coba Test Notifikasi lagi.");
    }

    const result = await testWhatsAppConnection({
      to: user.whatsappNumber,
      message: `Halo ${user.name}, ini pesan test dari SSO Connect. Kalau Anda menerima ini, notifikasi WhatsApp sudah berfungsi dengan baik!`,
    });
    if (!result.ok) throw new Error(result.reason);
    return { reason: result.reason };
  });
}
