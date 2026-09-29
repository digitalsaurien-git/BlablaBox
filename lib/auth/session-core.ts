import { createHash, randomBytes } from "node:crypto";

// Re-export cookie helpers so existing server-side imports keep working.
export {
  SESSION_DURATION_SECONDS,
  getSessionCookieName,
  getSessionCookieOptions,
} from "./session-cookie";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
