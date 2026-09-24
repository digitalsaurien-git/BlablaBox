import "server-only";

/**
 * Minimal security-event logger.
 *
 * Logs structured JSON to stdout, which Coolify / Docker captures
 * and makes searchable.  No secrets are ever included.
 *
 * Categories:
 *   auth       – login success/failure, logout, session creation
 *   access     – denied access (middleware redirect, 401/403)
 *   ratelimit  – rate-limit triggered
 *   input      – validation rejection, oversized payload
 */

type SecurityCategory = "auth" | "access" | "ratelimit" | "input";

interface SecurityEvent {
  category: SecurityCategory;
  action: string;
  /** Partial user identifier for log correlation (never full email). */
  userId?: string;
  /** Extra context (IP prefix, route, reason). Never secrets. */
  detail?: string;
}

export function logSecurity(event: SecurityEvent): void {
  const entry = {
    ts: new Date().toISOString(),
    level: "security",
    ...event,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}
