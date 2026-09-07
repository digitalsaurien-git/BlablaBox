import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const protectedPages = [
  "app/understand/new/page.tsx",
  "app/projects/new/page.tsx",
  "app/projects/page.tsx",
  "app/projects/[id]/page.tsx",
];

const protectedActions = [
  "app/understand/actions.ts",
  "app/projects/actions.ts",
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

test("les pages métier refusent un utilisateur non connecté", async () => {
  for (const file of protectedPages) {
    const source = await readFile(file, "utf8");
    assert.match(source, /requireCurrentUser\(\)/, `${file} doit vérifier la session`);
  }
});

test("toutes les Server Actions métier vérifient la session et la propriété", async () => {
  for (const file of protectedActions) {
    const source = await readFile(file, "utf8");
    assert.match(source, /requireCurrentUser\(\)/, `${file} doit vérifier la session`);
    assert.match(source, /ownedProjectWhere\(user\.id,/, `${file} doit filtrer par propriétaire`);
    assert.doesNotMatch(source, /findUnique\(\{\s*where:\s*\{\s*id:/);
  }
});

test("les créations sont rattachées au compte courant", async () => {
  for (const file of protectedActions) {
    const source = await readFile(file, "utf8");
    assert.match(source, /userId:\s*user\.id/);
    assert.doesNotMatch(source, /userId:\s*null/);
  }
});

test("la bibliothèque exclut les projets des autres comptes et les projets historiques", async () => {
  const source = await readFile("app/projects/page.tsx", "utf8");
  assert.match(source, /getProjects\(user\.id\)/);
  assert.match(source, /ownedProjectsWhere\(userId\)/);
  assert.doesNotMatch(source, /findMany\(\{\s*orderBy/);
});

test("la page projet et la route audio rendent un identifiant étranger inutilisable", async () => {
  const page = await readFile("app/projects/[id]/page.tsx", "utf8");
  const route = await readFile("app/api/projects/[id]/audio/route.ts", "utf8");
  assert.match(page, /findFirst\([\s\S]*ownedProjectWhere\(user\.id, id\)/);
  assert.match(page, /if \(!project\) notFound\(\)/);
  assert.match(route, /if \(!user\)[\s\S]*status: 401/);
  assert.match(route, /findFirst\([\s\S]*ownedProjectWhere\(user\.id, id\)/);
  assert.match(route, /status: 404/);
});

test("la session est créée côté serveur et la déconnexion révoque base et cookie", async () => {
  const source = await readFile("lib/auth/session.ts", "utf8");
  assert.match(source, /prisma\.session\.findUnique/);
  assert.match(source, /transaction\.session\.create/);
  assert.match(source, /transaction\.session\.deleteMany/);
  assert.match(source, /prisma\.session\.deleteMany/);
  assert.match(source, /maxAge:\s*0/);
});

test("les échecs ne révèlent pas l'existence d'un compte et ralentissent les essais répétés", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");
  const limiter = await readFile("lib/auth/rate-limit-core.ts", "utf8");
  assert.match(actions, /spendPasswordVerificationTime/);
  assert.match(actions, /recordLoginFailure/);
  assert.match(actions, /login\?error=invalid/);
  assert.doesNotMatch(actions, /compte n'existe pas|email inconnu|utilisateur introuvable/i);
  assert.match(limiter, /MAX_FAILURES\s*=\s*5/);
  assert.match(limiter, /createHash\("sha256"\)/);
  assert.match(limiter, /\$executeRaw/);
  assert.match(limiter, /ON CONFLICT \("keyHash"\) DO UPDATE/);
  assert.doesNotMatch(limiter, /findUnique[\s\S]*authThrottle\.upsert/);
});

test("le mot de passe utilise scrypt et une comparaison à temps constant", async () => {
  const source = await readFile("lib/auth/password-core.ts", "utf8");
  assert.match(source, /scrypt/);
  assert.match(source, /randomBytes\(SCRYPT_PARAMETERS\.saltLength\)/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /N:\s*65_536/);
  assert.match(source, /maxmem:\s*128 \* 1024 \* 1024/);
  assert.match(source, /actual\.length !== expected\.length/);
  assert.match(source, /password\.length > PASSWORD_MAX_LENGTH/);
});

test("l'ouverture des inscriptions est décidée uniquement côté serveur", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");
  const registration = await readFile("lib/auth/registration.ts", "utf8");
  assert.match(actions, /isRegistrationEnabled\(\)/);
  assert.match(registration, /server-only/);
  assert.doesNotMatch(actions, /NEXT_PUBLIC_/);
});

test("aucun secret d'authentification n'entre dans un composant client", async () => {
  const files = (await Promise.all(["app", "components", "lib"].map(sourceFiles))).flat();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(source, /passwordHash|tokenHash|SESSION|AUTH_SECRET/);
    assert.doesNotMatch(source, /@\/lib\/auth\//);
  }
  const environmentExample = await readFile(".env.example", "utf8");
  assert.doesNotMatch(
    environmentExample,
    /^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY)/im,
  );
});
