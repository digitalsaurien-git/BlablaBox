import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  hashSessionToken,
  SESSION_DURATION_SECONDS,
} from "./session-core";

export type CurrentUser = {
  id: string;
  email: string;
};

const readCurrentUser = async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session.user;
};

export const getCurrentUser = cache(readCurrentUser);

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function createUserSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = getSessionCookieName();
  const previousToken = cookieStore.get(cookieName)?.value;
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  await prisma.$transaction(async (transaction) => {
    if (previousToken) {
      await transaction.session.deleteMany({
        where: { tokenHash: hashSessionToken(previousToken) },
      });
    }
    await transaction.session.create({
      data: { tokenHash: hashSessionToken(token), userId, expiresAt },
    });
  });

  cookieStore.set(cookieName, token, getSessionCookieOptions());
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = getSessionCookieName();
  const token = cookieStore.get(cookieName)?.value;
  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
  cookieStore.set(cookieName, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
}
