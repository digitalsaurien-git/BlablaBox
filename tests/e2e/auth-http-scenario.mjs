import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.AUTH_E2E_BASE_URL;
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!baseUrl || !databaseUrl) {
  throw new Error("AUTH_E2E_BASE_URL et AUTH_TEST_DATABASE_URL sont obligatoires");
}

class HttpSession {
  cookies = new Map();
  lastSetCookies = [];

  async request(path, init = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) {
      headers.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers,
      redirect: "manual",
    });
    this.lastSetCookies = response.headers.getSetCookie();
    for (const setCookie of this.lastSetCookies) {
      const [pair, ...attributes] = setCookie.split(";").map((part) => part.trim());
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const expired = attributes.some((attribute) => /^Max-Age=0$/i.test(attribute));
      if (expired || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async submit(path, buttonText, fields) {
    const page = await this.request(path);
    assert.equal(page.status, 200, `GET ${path}`);
    const html = await page.text();
    const forms = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map((match) => match[1]);
    const form = forms.find((candidate) => candidate.includes(buttonText));
    assert.ok(form, `formulaire « ${buttonText} » présent sur ${path}`);
    const actionName = form.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
    assert.ok(actionName, `identifiant Server Action présent pour « ${buttonText} »`);
    const body = new FormData();
    body.set(actionName, "");
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    return this.request(path, {
      method: "POST",
      body,
    });
  }
}

function assertRedirect(response, expectedLocation) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), expectedLocation);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = randomBytes(8).toString("hex");
const emailA = `auth-e2e-${marker}-a@example.invalid`;
const emailB = `auth-e2e-${marker}-b@example.invalid`;
const password = `Aa1-${randomBytes(18).toString("base64url")}`;
const wrongPassword = `Bb2-${randomBytes(18).toString("base64url")}`;
const titleA = `Objectif A ${marker}`;
const titleB = `Objectif B ${marker}`;
const anonymous = new HttpSession();
const accountA = new HttpSession();
const accountB = new HttpSession();

try {
  const anonymousProjects = await anonymous.request("/projects");
  assert.equal(anonymousProjects.status, 307);
  assert.equal(anonymousProjects.headers.get("location"), "/login");
  assert.equal((await anonymous.request("/api/projects/inconnu/audio")).status, 401);

  const registerA = await accountA.submit("/register", "Créer mon compte", {
    email: emailA.toUpperCase(),
    password,
    passwordConfirmation: password,
  });
  assertRedirect(registerA, "/projects");
  const registrationCookie = accountA.lastSetCookies.find((cookie) =>
    cookie.startsWith("__Host-blablabox_session="),
  );
  assert.ok(registrationCookie);
  assert.match(registrationCookie, /; Secure/i);
  assert.match(registrationCookie, /; HttpOnly/i);
  assert.match(registrationCookie, /; Path=\//i);
  assert.match(registrationCookie, /; SameSite=Lax/i);
  assert.doesNotMatch(registrationCookie, /; Domain=/i);
  const firstTokenA = accountA.cookies.get("__Host-blablabox_session");
  assert.ok(firstTokenA);

  assert.equal((await accountA.request("/projects")).status, 200);
  assert.equal((await accountA.request("/projects")).status, 200);
  const userA = await prisma.user.findUniqueOrThrow({ where: { email: emailA } });
  assert.equal(await prisma.session.count({ where: { userId: userA.id } }), 1);

  const createA = await accountA.submit("/projects/new", "Generer le script", {
    sourceContent: `Contenu A ${marker}`,
    learningObjective: titleA,
    targetDurationMinutes: "3",
    deliveryType: "COURSE_SUMMARY",
    audience: "10-12 ans",
    tone: "Clair et vivant",
    level: "Débutant",
  });
  assert.equal(createA.status, 303);
  const projectAId = createA.headers.get("location")?.split("/").at(-1);
  assert.ok(projectAId);

  const logoutA = await accountA.submit("/projects", "Déconnexion", {});
  assertRedirect(logoutA, "/");
  assert.ok(accountA.lastSetCookies.some((cookie) => /Max-Age=0/i.test(cookie)));
  assert.equal(accountA.cookies.has("__Host-blablabox_session"), false);
  assert.equal(await prisma.session.count({ where: { userId: userA.id } }), 0);

  const registerB = await accountB.submit("/register", "Créer mon compte", {
    email: emailB,
    password,
    passwordConfirmation: password,
  });
  assertRedirect(registerB, "/projects");
  const userB = await prisma.user.findUniqueOrThrow({ where: { email: emailB } });

  const createB = await accountB.submit("/projects/new", "Generer le script", {
    sourceContent: `Contenu B ${marker}`,
    learningObjective: titleB,
    targetDurationMinutes: "3",
    deliveryType: "COURSE_SUMMARY",
    audience: "10-12 ans",
    tone: "Clair et vivant",
    level: "Débutant",
  });
  assert.equal(createB.status, 303);
  const projectBId = createB.headers.get("location")?.split("/").at(-1);
  assert.ok(projectBId);

  const listB = await (await accountB.request("/projects")).text();
  assert.match(listB, new RegExp(titleB));
  assert.doesNotMatch(listB, new RegExp(titleA));
  assert.doesNotMatch(listB, /Projet historique sans propriétaire/);
  assert.equal((await accountB.request(`/projects/${projectBId}`)).status, 200);
  assertRedirect(await accountB.submit("/projects", "Déconnexion", {}), "/");

  const failedKnown = await accountA.submit("/login", "Se connecter", {
    email: emailA,
    password: wrongPassword,
  });
  const failedUnknown = await anonymous.submit("/login", "Se connecter", {
    email: `unknown-${marker}@example.invalid`,
    password: wrongPassword,
  });
  assertRedirect(failedKnown, "/login?error=invalid");
  assertRedirect(failedUnknown, "/login?error=invalid");

  const loginA = await accountA.submit("/login", "Se connecter", {
    email: emailA.toUpperCase(),
    password,
  });
  assertRedirect(loginA, "/projects");
  const authenticatedTokenA = accountA.cookies.get("__Host-blablabox_session");
  assert.ok(authenticatedTokenA);
  assert.notEqual(authenticatedTokenA, firstTokenA);

  const listA = await (await accountA.request("/projects")).text();
  assert.match(listA, new RegExp(titleA));
  assert.doesNotMatch(listA, new RegExp(titleB));
  assert.doesNotMatch(listA, /Projet historique sans propriétaire/);
  assert.equal((await accountA.request(`/projects/${projectBId}`)).status, 404);
  assert.equal((await accountA.request(`/api/projects/${projectBId}/audio`)).status, 404);

  const projectBBefore = await prisma.project.findUniqueOrThrow({ where: { id: projectBId } });
  assertRedirect(
    await accountA.submit(`/projects/${projectAId}`, "Relancer la génération", {
      projectId: projectBId,
    }),
    "/projects",
  );
  assertRedirect(
    await accountA.submit(`/projects/${projectAId}`, "Générer l", {
      projectId: projectBId,
    }),
    "/projects",
  );
  assertRedirect(
    await accountA.submit(`/projects/${projectAId}`, "Supprimer", { projectId: projectBId }),
    "/projects",
  );
  const projectBAfter = await prisma.project.findUniqueOrThrow({ where: { id: projectBId } });
  assert.equal(projectBAfter.contentVersion, projectBBefore.contentVersion);
  assert.equal(projectBAfter.audioStatus, projectBBefore.audioStatus);
  assert.equal(projectBAfter.updatedAt.getTime(), projectBBefore.updatedAt.getTime());

  assert.equal(await prisma.project.count({ where: { id: "legacy-null-owner", userId: null } }), 1);
  assert.equal(await prisma.project.count({ where: { id: projectAId, userId: userA.id } }), 1);
  assert.equal(await prisma.project.count({ where: { id: projectBId, userId: userB.id } }), 1);

  await prisma.session.updateMany({
    where: { userId: userA.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const cookieBeforeExpiryCheck = accountA.cookies.get("__Host-blablabox_session");
  const expiredRequest = await accountA.request("/projects");
  assert.equal(expiredRequest.status, 307);
  assert.equal(expiredRequest.headers.get("location"), "/login");
  assert.equal(accountA.cookies.get("__Host-blablabox_session"), cookieBeforeExpiryCheck);

  const loginAfterExpiry = await accountA.submit("/login", "Se connecter", {
    email: emailA,
    password,
  });
  assertRedirect(loginAfterExpiry, "/projects");
  assert.notEqual(
    accountA.cookies.get("__Host-blablabox_session"),
    cookieBeforeExpiryCheck,
  );
  assert.equal(await prisma.session.count({ where: { userId: userA.id } }), 1);

  assertRedirect(await accountA.submit("/projects", "Déconnexion", {}), "/");
  assert.equal(accountA.cookies.has("__Host-blablabox_session"), false);
  assert.equal(await prisma.session.count({ where: { userId: userA.id } }), 0);

  console.log(JSON.stringify({
    accountsCreated: 2,
    projectsCreated: 2,
    anonymousRejected: true,
    listsIsolated: true,
    crossUserViewStatus: 404,
    crossUserAudioStatus: 404,
    crossUserWritesRejected: ["regenerate", "audio", "delete"],
    legacyProjectInvisible: true,
    sessionPersisted: true,
    databaseExpiryEnforced: true,
    tokenRotatedAfterAuthentication: true,
    logoutRevokedDatabaseAndCookie: true,
    productionCookieAttributesVerified: true,
  }));
} finally {
  await prisma.session.deleteMany({ where: { user: { email: { contains: marker } } } });
  await prisma.project.deleteMany({ where: { user: { email: { contains: marker } } } });
  await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  await prisma.authThrottle.deleteMany({});
  await prisma.$disconnect();
}
