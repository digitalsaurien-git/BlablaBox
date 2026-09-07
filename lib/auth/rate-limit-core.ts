import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const BLOCK_DURATION_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 5;

export function throttleKey(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

export async function recordLoginFailureAtomic(
  database: Pick<PrismaClient, "$executeRaw">,
  email: string,
): Promise<void> {
  const keyHash = throttleKey(email);
  await database.$executeRaw`
    INSERT INTO "AuthThrottle" ("keyHash", "failureCount", "blockedUntil", "updatedAt")
    VALUES (${keyHash}, 1, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT ("keyHash") DO UPDATE SET
      "failureCount" = CASE
        WHEN "AuthThrottle"."updatedAt" < CURRENT_TIMESTAMP - (${FAILURE_WINDOW_MS} * INTERVAL '1 millisecond')
          THEN 1
        ELSE "AuthThrottle"."failureCount" + 1
      END,
      "blockedUntil" = CASE
        WHEN (
          CASE
            WHEN "AuthThrottle"."updatedAt" < CURRENT_TIMESTAMP - (${FAILURE_WINDOW_MS} * INTERVAL '1 millisecond')
              THEN 1
            ELSE "AuthThrottle"."failureCount" + 1
          END
        ) >= ${MAX_FAILURES}
          THEN CURRENT_TIMESTAMP + (${BLOCK_DURATION_MS} * INTERVAL '1 millisecond')
        ELSE NULL
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}
