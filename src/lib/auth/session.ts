import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "sso_cms_session";
const MAX_AGE_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS || 12);

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Configure it in your environment before running the app."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Creates a signed, httpOnly session cookie. This never exposes a database
 * secret or credential to the client — only a signed JWT identifying the
 * user, verified server-side on every request via middleware and
 * requireUser().
 */
export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + MAX_AGE_HOURS * 60 * 60 * 1000);

  const token = await new SignJWT({ ...payload } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  cookies().delete(COOKIE_NAME);
}

export async function readSessionFromCookieValue(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Server Component / Server Action helper. Reads and verifies the session
 * cookie. Returns null if absent or invalid/expired — callers must decide
 * whether to redirect (pages) or throw (server actions / route handlers).
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  return readSessionFromCookieValue(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
