import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Route protection (spec section 51: "Protected routes"). This is the FIRST
 * line of defense — every (app)/* route requires a valid session cookie.
 * Role-specific authorization still happens again server-side in each
 * Server Action / page via requireUser() + requirePermission(), because a
 * valid session alone doesn't mean the user may perform a given action.
 */

// /api/telegram/webhook is called directly by Telegram's servers, which
// never carry our session cookie — it authenticates itself instead via the
// x-telegram-bot-api-secret-token header (checked inside the route) plus
// resolving a real User from the message's chat ID, so "public" here means
// "reachable without a browser session," not "unauthenticated."
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/telegram/webhook"];
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "sso_cms_session";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET || "";
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, getSecretKey());
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
