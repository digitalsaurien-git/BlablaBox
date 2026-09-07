import { createHash, randomBytes } from "node:crypto";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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
