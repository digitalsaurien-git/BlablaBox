import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la migration conserve les anciens projets et normalise leurs statuts", async () => {
  const migration = await readFile("prisma/migrations/20260806120000_add_real_audio_generation/migration.sql", "utf8");
  assert.match(migration, /WHEN 'NOT_STARTED' THEN 'NOT_GENERATED'/);
  assert.match(migration, /WHEN 'MOCK_READY' THEN 'NOT_GENERATED'/);
  assert.match(migration, /ADD COLUMN "audioErrorMessage" TEXT/);
  assert.doesNotMatch(migration, /DROP TABLE "Project"/);
});
