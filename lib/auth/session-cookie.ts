/**
 * Session cookie helpers — Edge-compatible (no Node.js built-ins).
 *
 * These utilities are safe to import from middleware and client-adjacent
 * code because they never touch `node:crypto` or any other Node-only API.
 */

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14;

export function getSessionCookieName(environment = process.env.NODE_ENV): string {
  return environment === "production"
    ? "__Host-blablabox_session"
    : "blablabox_session";
}

export function getSessionCookieOptions(environment = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    secure: environment === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
