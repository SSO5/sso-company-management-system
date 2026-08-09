import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "./session";

/**
 * Use in Server Components / layouts that must be behind login.
 * Middleware already blocks unauthenticated requests to (app)/*, but this
 * is the server-side belt-and-suspenders check — never trust the client.
 */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Use inside Server Actions / Route Handlers, where redirecting isn't
 * appropriate — throw instead so the caller can surface a clean error.
 */
export async function requireUserOrThrow(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}
