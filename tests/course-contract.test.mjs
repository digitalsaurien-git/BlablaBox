import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("le schéma du Lot 2 impose la propriété et les relations composites", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  for (const model of ["SchoolYear", "Subject", "CourseTheme", "Chapter", "CoursePart", "SourceAsset", "SourceImport", "SourcePlacement"]) assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  assert.match(schema, /userId\s+String/);
  assert.match(schema, /sortSegments\s+Int\[\]/);
  assert.match(schema, /referenceLabel\s+String\?/);
  assert.match(schema, /orderVersion\s+Int/);
  assert.match(schema, /courseThemeId, userId/);
  assert.match(schema, /chapterId, userId, courseThemeId/);
  assert.match(schema, /@@unique\(\[userId, sha256\]\)/);
  assert.match(schema, /@@unique\(\[coursePartId, sourceAssetId\]\)/);
});

test("la migration de fondation est strictement additive", async () => {
  const migration = await readFile("prisma/migrations/20260909120000_add_course_library_foundation/migration.sql", "utf8");
  assert.doesNotMatch(migration, /^\s*(?:UPDATE|DELETE|DROP)\b/im);
  assert.match(migration, /CREATE TABLE "SourceAsset"/);
  assert.match(migration, /"SourceAsset_userId_sha256_key"/);
  assert.match(migration, /SourcePlacement_coursePartId_sourceAssetId_key/);
});

test("les routes et actions de cours contrôlent la session et le propriétaire", async () => {
  const files = ["app/courses/page.tsx", "app/courses/actions.ts", "app/api/sources/route.ts", "app/api/sources/[id]/download/route.ts"];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /getCurrentUser|requireCurrentUser/);
    assert.match(source, /userId/);
  }
  const download = await readFile("app/api/sources/[id]/download/route.ts", "utf8");
  assert.match(download, /status: 401/);
  assert.match(download, /status: 404/);
  assert.match(download, /Cache-Control.*private/);
});

test("l’import intelligent reste local et ne crée aucun chapitre implicitement", async () => {
  const source = await readFile("app/api/courses/analyze/route.ts", "utf8");
  const mutation = await readFile("lib/courses/smart-import.ts", "utf8");
  assert.match(source, /validateSourceUpload/);
  assert.match(source, /extractDocumentText/);
  assert.doesNotMatch(source + mutation, /getLLMProvider|OCR_PROVIDER/);
  assert.match(mutation, /chapterId:\s*null/);
  assert.doesNotMatch(mutation, /chapter\.create/);
  const page = await readFile("app/courses/page.tsx", "utf8");
  assert.match(page, /Document encore attendu/);
  assert.match(page, /Trier les repères/);
});
