import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  hashSessionToken,
} from "../lib/auth/session-core.ts";
import { ownedProjectWhere, ownedProjectsWhere } from "../lib/auth/ownership.ts";
import {
  PASSWORD_MAX_LENGTH,
  SCRYPT_PARAMETERS,
  hashPassword,
  verifyPassword,
} from "../lib/auth/password-core.ts";
import { isRegistrationEnabled } from "../lib/auth/registration-core.ts";
import { normalizeEmail, validateCredentials, validateRegistration } from "../lib/auth/validation.ts";

test("les adresses sont normalisées et toutes les entrées sont validées côté serveur", () => {
  assert.equal(normalizeEmail("  Parent@Example.COM "), "parent@example.com");
  assert.deepEqual(
    validateCredentials({ email: "Parent@Example.COM", password: "mot-de-passe-solide" }),
    { email: "parent@example.com", password: "mot-de-passe-solide" },
  );
  assert.equal(validateCredentials({ email: "invalide", password: "mot-de-passe-solide" }), null);
  assert.equal(validateCredentials({ email: "a@example.com", password: "trop-court" }), null);
  assert.equal(
    validateRegistration({
      email: "a@example.com",
      password: "mot-de-passe-solide",
      passwordConfirmation: "autre-mot-de-passe",
    }),
    null,
  );
});

test("les jetons de session sont aléatoires et seul leur condensat est indexable", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 43);
  assert.match(hashSessionToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSessionToken(first), first);
});

test("le cookie de session est HttpOnly, same-site et sécurisé en production", () => {
  assert.equal(getSessionCookieName("production"), "__Host-blablabox_session");
  assert.equal(getSessionCookieName("development"), "blablabox_session");
  assert.deepEqual(getSessionCookieOptions("production"), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 1_209_600,
  });
  assert.equal("domain" in getSessionCookieOptions("production"), false);
  assert.equal(getSessionCookieOptions("development").secure, false);
});

test("les inscriptions sont ouvertes par défaut hors production et fermées implicitement en production", () => {
  assert.equal(isRegistrationEnabled("development", undefined), true);
  assert.equal(isRegistrationEnabled("test", undefined), true);
  assert.equal(isRegistrationEnabled("production", undefined), false);
  assert.equal(isRegistrationEnabled("production", "true"), true);
  assert.equal(isRegistrationEnabled("development", "false"), false);
  assert.equal(isRegistrationEnabled("production", "valeur-invalide"), false);
});

test("les prédicats de propriété exigent toujours le compte et la ressource", () => {
  assert.deepEqual(ownedProjectWhere("user-a", "project-b"), {
    id: "project-b",
    userId: "user-a",
  });
  assert.deepEqual(ownedProjectsWhere("user-a"), { userId: "user-a" });
});

test("un mot de passe n'est jamais stocké en clair et sa vérification rejette une erreur", async () => {
  const password = "mot-de-passe-vraiment-solide";
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.match(hash, /^scrypt-v1\$65536\$8\$1\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("mot-de-passe-incorrect", hash), false);
  assert.equal(await verifyPassword(password, "format-invalide"), false);
});

test("scrypt utilise un sel suffisant, une marge mémoire et refuse les entrées trop longues", async () => {
  const minimumMemory = 128 * SCRYPT_PARAMETERS.N * SCRYPT_PARAMETERS.r;
  assert.equal(SCRYPT_PARAMETERS.saltLength, 16);
  assert.equal(SCRYPT_PARAMETERS.keyLength, 64);
  assert.ok(SCRYPT_PARAMETERS.maxmem >= minimumMemory * 1.5);

  const hash = await hashPassword("mot-de-passe-vraiment-solide");
  const salt = Buffer.from(hash.split("$")[4], "base64url");
  assert.equal(salt.length, SCRYPT_PARAMETERS.saltLength);

  const oversizedPassword = "x".repeat(PASSWORD_MAX_LENGTH + 1);
  await assert.rejects(hashPassword(oversizedPassword), RangeError);
  assert.equal(await verifyPassword(oversizedPassword, hash), false);
});
