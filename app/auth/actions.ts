"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, spendPasswordVerificationTime, verifyPassword } from "@/lib/auth/password";
import { clearLoginFailures, isLoginAllowed, recordLoginFailure } from "@/lib/auth/rate-limit";
import { isRegistrationEnabled } from "@/lib/auth/registration";
import { createUserSession, destroyCurrentSession } from "@/lib/auth/session";
import { validateCredentials, validateRegistration } from "@/lib/auth/validation";

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function registerAccount(formData: FormData) {
  if (!isRegistrationEnabled()) redirect("/register?error=closed");
  const credentials = validateRegistration({
    email: readString(formData, "email"),
    password: readString(formData, "password"),
    passwordConfirmation: readString(formData, "passwordConfirmation"),
  });
  if (!credentials) redirect("/register?error=invalid");

  const passwordHash = await hashPassword(credentials.password);
  let userId: string | null = null;
  try {
    const user = await prisma.user.create({
      data: { email: credentials.email, passwordHash },
      select: { id: true },
    });
    userId = user.id;
  } catch {
    // A duplicate email and a storage error deliberately share the same public response.
  }
  if (!userId) redirect("/register?error=unavailable");

  try {
    await createUserSession(userId);
  } catch {
    redirect("/login?error=unavailable");
  }
  redirect("/projects");
}

export async function login(formData: FormData) {
  const credentials = validateCredentials({
    email: readString(formData, "email"),
    password: readString(formData, "password"),
  });
  if (!credentials) redirect("/login?error=invalid");

  let authenticatedUserId: string | null = null;
  try {
    const [allowed, user] = await Promise.all([
      isLoginAllowed(credentials.email),
      prisma.user.findUnique({
        where: { email: credentials.email },
        select: { id: true, passwordHash: true },
      }),
    ]);
    const passwordIsValid = user
      ? await verifyPassword(credentials.password, user.passwordHash)
      : await spendPasswordVerificationTime(credentials.password).then(() => false);

    if (allowed && user && passwordIsValid) {
      authenticatedUserId = user.id;
      await clearLoginFailures(credentials.email);
    } else if (allowed) {
      await recordLoginFailure(credentials.email);
    }
  } catch {
    // Authentication failures never expose whether the account exists.
  }

  if (!authenticatedUserId) redirect("/login?error=invalid");
  try {
    await createUserSession(authenticatedUserId);
  } catch {
    redirect("/login?error=unavailable");
  }
  redirect("/projects");
}

export async function logout() {
  await destroyCurrentSession();
  redirect("/");
}
