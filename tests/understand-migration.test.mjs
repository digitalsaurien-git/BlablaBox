import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la migration Comprendre est additive et ne certifie aucun ancien MP3", async () => {
  const migration = await readFile(
    "prisma/migrations/20260821193000_add_understand_and_sources/migration.sql",
    "utf8",
  );
  assert.match(migration, /'DICTATE_WRITE'/);
  assert.match(migration, /ADD COLUMN "audioContentVersion" INTEGER/);
  assert.match(migration, /CREATE TABLE "ProjectSource"/);
  assert.doesNotMatch(migration, /UPDATE "Project"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM/);
});

test("les routes historiques restent présentes", async () => {
  const files = [
    "app/projects/page.tsx",
    "app/projects/new/page.tsx",
    "app/projects/[id]/page.tsx",
  ];
  for (const file of files) {
    assert.ok((await readFile(file, "utf8")).length > 0, `${file} doit rester accessible`);
  }
});
