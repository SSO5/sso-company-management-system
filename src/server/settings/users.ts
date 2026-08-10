"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/workflows/audit";
import { createUserSchema, updateUserSchema } from "@/lib/validation/auth";
import { runAction, type ActionResult } from "@/lib/action-helpers";
import { assertFileAllowed, saveBrandingAsset } from "@/lib/storage";
import type { UserRole } from "@prisma/client";

/** Lightweight lookup used by every "assign to" dropdown across modules. */
export async function listUsersForPicker(role?: UserRole) {
  await requireUserOrThrow();
  return prisma.user.findMany({
    where: { isActive: true, ...(role ? { role } : {}) },
    select: { id: true, name: true, role: true, title: true },
    orderBy: { name: "asc" },
  });
}

export async function listUsers() {
  const actor = await requireUserOrThrow();
  requirePermission(actor.role, "users", "view");
  return prisma.user.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "users", "create");
    const data = createUserSchema.parse(input);

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name, email: data.email, role: data.role, title: data.title || null,
          whatsappNumber: data.whatsappNumber, passwordHash,
        },
      });
      await logActivity(tx, {
        userId: actor.userId, action: "CREATE", entityType: "USER", entityId: created.id,
        description: `Created user ${created.name} (${created.role})`,
      });
      return created;
    });

    revalidatePath("/settings/users");
    return { id: user.id };
  });
}

export async function toggleUserActive(id: string, isActive: boolean): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "users", "update");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive } });
      await logActivity(tx, {
        userId: actor.userId, action: "UPDATE", entityType: "USER", entityId: id,
        description: `${isActive ? "Activated" : "Deactivated"} user ${id}`,
      });
    });
    revalidatePath("/settings/users");
    return { id };
  });
}

/**
 * Edit User — profile fields (name/email/role/title/status), an optional
 * password reset, and an optional signature image upload (used as the TTD
 * on the Quotation PDF when this user is picked as Signer). Takes FormData
 * directly (rather than the usual JSON `unknown` input) because a File
 * can't round-trip through JSON.
 */
export async function updateUserAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "users", "update");

    const data = updateUserSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      title: formData.get("title") || null,
      whatsappNumber: formData.get("whatsappNumber") || null,
      isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
      password: formData.get("password") || "",
    });

    const file = formData.get("signature");
    let signatureImageUrl: string | undefined;
    if (file instanceof File && file.size > 0) {
      assertFileAllowed(file.name, file.type, file.size);
      const buffer = Buffer.from(await file.arrayBuffer());
      signatureImageUrl = await saveBrandingAsset(buffer, { prefix: `signature-${data.id}`, originalName: file.name });
    }

    const passwordHash = data.password ? await hashPassword(data.password) : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.id },
        data: {
          name: data.name,
          email: data.email,
          role: data.role,
          title: data.title || null,
          whatsappNumber: data.whatsappNumber,
          isActive: data.isActive,
          ...(passwordHash ? { passwordHash } : {}),
          ...(signatureImageUrl ? { signatureImageUrl } : {}),
        },
      });
      await logActivity(tx, {
        userId: actor.userId, action: "UPDATE", entityType: "USER", entityId: data.id,
        description: `Updated user ${data.name}${signatureImageUrl ? " (new signature uploaded)" : ""}`,
      });
    });

    revalidatePath("/settings/users");
    return { id: data.id };
  });
}

/**
 * True delete, not just deactivate. Most users with any project history will
 * fail this (FK constraints from Opportunity/Quotation/Project/etc. that
 * intentionally RESTRICT deletion so history never dangles) — in that case
 * we catch it and tell the caller to Deactivate instead, rather than leaking
 * a raw Prisma/DB error.
 */
export async function deleteUser(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireUserOrThrow();
    requirePermission(actor.role, "users", "delete");
    if (id === actor.userId) {
      throw new Error("You cannot delete your own account while signed in as it.");
    }

    try {
      await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUniqueOrThrow({ where: { id } });
        await tx.user.delete({ where: { id } });
        await logActivity(tx, {
          userId: actor.userId, action: "DELETE", entityType: "USER", entityId: id,
          description: `Deleted user ${target.name} (${target.email})`,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new Error(
          "This user already has linked records (opportunities, quotations, projects, etc.) and can't be permanently deleted. Deactivate the user instead."
        );
      }
      throw err;
    }

    revalidatePath("/settings/users");
    return { id };
  });
}
