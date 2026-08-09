import { ForbiddenError } from "@/lib/permissions";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Every server action should be wrapped with this (spec section 49:
 * "Never show stack traces / database errors / internal server details").
 * Known, safe-to-display errors (ForbiddenError, explicit Error messages
 * thrown by our own workflow functions) are passed through as-is. Anything
 * unexpected (a raw Prisma error, a network failure, etc.) is logged
 * server-side and replaced with a generic message.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }
    // Business-rule errors thrown deliberately by our own lib/workflows/*
    // functions (e.g. "Only draft quotations can be submitted...") are
    // written as plain Error with a human-readable message and are safe to
    // surface directly.
    if (err instanceof Error && isKnownBusinessError(err.message)) {
      return { ok: false, error: err.message };
    }

    console.error("[server-action-error]", err);
    return { ok: false, error: "Something went wrong while processing your request. Please try again." };
  }
}

function isKnownBusinessError(message: string): boolean {
  // Heuristic allowlist: our workflow functions always throw short,
  // user-safe sentences (no stack traces, no SQL, no file paths).
  return (
    message.length < 300 &&
    !message.includes("Prisma") &&
    !message.match(/at \S+ \(.*:\d+:\d+\)/) &&
    !message.toLowerCase().includes("econnrefused")
  );
}
