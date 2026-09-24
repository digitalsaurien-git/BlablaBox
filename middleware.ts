import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookieName } from "@/lib/auth/session-core";
import { logSecurity } from "@/lib/security-logger";

/**
 * Lightweight Edge-compatible middleware.
 *
 * It checks for the *presence* of the session cookie on protected routes and
 * redirects unauthenticated visitors to /login.  The full database-backed
 * session validation still happens in `requireCurrentUser()` / `getCurrentUser()`
 * inside each page / action — this layer is a fast safety net that keeps
 * unauthenticated traffic away from protected pages without hitting the DB.
 */

const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Static assets, Next.js internals, health endpoint
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/favicon")
  ) {
    return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Check session cookie presence (lightweight, no DB call)
  const cookieName = getSessionCookieName(
    process.env.NODE_ENV ?? "development",
  );
  const sessionCookie = request.cookies.get(cookieName);

  if (!sessionCookie?.value) {
    logSecurity({
      category: "access",
      action: "unauthenticated_redirect",
      detail: pathname,
    });
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static, _next/image (static files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
