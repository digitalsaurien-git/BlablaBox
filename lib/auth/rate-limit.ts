import "server-only";

import { prisma } from "@/lib/prisma";
import { recordLoginFailureAtomic, throttleKey } from "./rate-limit-core";

export async function isLoginAllowed(email: string): Promise<boolean> {
  const throttle = await prisma.authThrottle.findUnique({
    where: { keyHash: throttleKey(email) },
  });
  return !throttle?.blockedUntil || throttle.blockedUntil.getTime() <= Date.now();
}

export async function recordLoginFailure(email: string): Promise<void> {
  await recordLoginFailureAtomic(prisma, email);
}

export async function clearLoginFailures(email: string): Promise<void> {
  await prisma.authThrottle.deleteMany({ where: { keyHash: throttleKey(email) } });
}
