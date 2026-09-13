import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, type SessionPayload } from "./session";
// Request-local memoization only. Disabled accounts and changed roles take effect immediately.
const currentUser = cache(async (): Promise<SessionPayload | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return {
    ...session,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
});
/** For API routes: return 401 rather than an HTML login redirect. */
export const getCurrentUser = currentUser;
export async function requireUser(): Promise<SessionPayload> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function requireUserOrThrow(): Promise<SessionPayload> {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
