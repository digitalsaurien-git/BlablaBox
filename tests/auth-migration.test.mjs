import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la migration d'authentification est additive et conserve tous les projets", async () => {
  const migration = await readFile(
    "prisma/migrations/20260907120000_add_accounts_and_sessions/migration.sql",
    "utf8",
  );
  assert.match(migration, /CREATE TABLE "User"/);
  assert.match(migration, /CREATE TABLE "Session"/);
  assert.match(migration, /CREATE TABLE "AuthThrottle"/);
  assert.match(migration, /ADD CONSTRAINT "Project_userId_fkey"/);
  assert.doesNotMatch(migration, /NOT VALID/);
  assert.doesNotMatch(migration, /UPDATE "Project"|DELETE FROM|DROP TABLE|DROP COLUMN/);
});
