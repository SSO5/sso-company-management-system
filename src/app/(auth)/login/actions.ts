"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import type { LoginFormState } from "./types";

// Brute-force protection: unlimited password attempts was a real gap (no
// rate limit at all). After MAX_FAILED_LOGIN_ATTEMPTS wrong passwords in a
// row, the account locks for LOCKOUT_MINUTES instead of accepting further
// guesses — bounded and self-clearing, no manual unlock needed.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Case-insensitive lookup: loginSchema already lowercases what the person
  // typed, but rows created before that normalization can still hold mixed
  // case (e.g. "Sultonmuch96@gmail.com"). findUnique is exact-match and would
  // silently miss those, producing a misleading "wrong password" error.
  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
  });
  if (!user || !user.isActive) {
    return { error: "Invalid email or password." };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutesLeft} menit.` };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingOut = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: lockingOut
        ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) }
        : { failedLoginAttempts: attempts },
    });
    return {
      error: lockingOut
        ? `Terlalu banyak percobaan gagal. Coba lagi dalam ${LOCKOUT_MINUTES} menit.`
        : "Invalid email or password.",
    };
  }

  await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        entityType: "USER",
        entityId: user.id,
        description: `${user.name} logged in`,
      },
    }),
  ]);

  redirect("/dashboard");
}
