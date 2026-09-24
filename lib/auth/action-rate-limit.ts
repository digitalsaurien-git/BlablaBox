import "server-only";

import { logSecurity } from "@/lib/security-logger";

/**
 * In-memory sliding-window rate limiter for expensive server actions
 * (LLM generation, TTS, file uploads).
 *
 * This is intentionally simple: a Map keyed by userId, storing timestamps.
 * It resets on server restart — acceptable for a single-instance deployment
 * and avoids a Prisma migration.
 *
 * For multi-instance deployments, move to a Redis- or DB-backed store.
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

const buckets = new Map<string, number[]>();

function pruneOld(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  // Find the first timestamp within the window
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= cutoff) i++;
  return i > 0 ? timestamps.slice(i) : timestamps;
}

/**
 * Check whether the given key is rate-limited. If not, records the request.
 *
 * @returns `true` if the request is allowed, `false` if rate-limited.
 */
export function checkActionRateLimit(
  key: string,
  config: RateLimitConfig,
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  const timestamps = existing ? pruneOld(existing, config.windowMs, now) : [];

  if (timestamps.length >= config.maxRequests) {
    buckets.set(key, timestamps);
    logSecurity({
      category: "ratelimit",
      action: "blocked",
      detail: key.replace(/:.*/, ""), // only the bucket type (llm/tts/upload), never the userId
    });
    return false; // rate-limited
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return true; // allowed
}

// Periodic cleanup of stale entries (every 5 minutes)
if (typeof globalThis !== "undefined") {
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  const MAX_STALENESS = 30 * 60 * 1000;

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of buckets) {
      const last = timestamps[timestamps.length - 1];
      if (!last || now - last > MAX_STALENESS) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

// ── Pre-configured limiters ────────────────────────────────────────

/** LLM script generation: 10 requests per 15 minutes per user. */
export function checkLLMRateLimit(userId: string): boolean {
  return checkActionRateLimit(`llm:${userId}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
  });
}

/** TTS audio generation: 5 requests per 15 minutes per user. */
export function checkTTSRateLimit(userId: string): boolean {
  return checkActionRateLimit(`tts:${userId}`, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
}

/** File uploads: 20 per 15 minutes per user. */
export function checkUploadRateLimit(userId: string): boolean {
  return checkActionRateLimit(`upload:${userId}`, {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000,
  });
}
