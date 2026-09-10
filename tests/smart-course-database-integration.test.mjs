import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { importSmartCourse } from "../lib/courses/smart-import.ts";
import * as storage from "../lib/sources/storage.ts";
import { disposableDatabaseUrl } from "./helpers/lot2-environment.mjs";
import { syntheticPdf } from "./helpers/source-fixtures.mjs";

test("import intelligent PostgreSQL : transaction, regroupement, ordre et isolation", { skip: process.env.LOT2_TEST_DATABASE_URL ? false : "LOT2_TEST_DATABASE_URL jetable non définie" }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL) } } });
  const directory = await mkdtemp(path.join(tmpdir(), "blablabox-smart-course-"));
  const previousRoot = process.env.SOURCE_STORAGE_ROOT;
  process.env.SOURCE_STORAGE_ROOT = directory;
  const marker = randomUUID();
  const userA = marker + "-a";
  const userB = marker + "-b";
  try {
    await db.user.createMany({ data: [
      { id: userA, email: userA + "@example.invalid", passwordHash: "synthetic" },
      { id: userB, email: userB + "@example.invalid", passwordHash: "synthetic" },
    ] });
    const yearA = await db.schoolYear.create({ data: { userId: userA, label: "Synthetic year" } });
    const subjectA = await db.subject.create({ data: { userId: userA, schoolYearId: yearA.id, title: "Histoire-géo" } });
    const yearB = await db.schoolYear.create({ data: { userId: userB, label: "Synthetic year" } });
    const subjectB = await db.subject.create({ data: { userId: userB, schoolYearId: yearB.id, title: "Histoire-géo" } });

    const common = {
      userId: userA,
      subjectId: subjectA.id,
      courseTitle: "Les débuts de l’humanité",
      existingThemeId: null,
      expectedOrderVersion: null,
      declaredMime: "application/pdf",
    };
    const first = await importSmartCourse(db, {
      ...common, referenceLabel: "4.2", partTitle: "Partie 4.2",
      fileName: "cours.débuts de l'humanité 4.2.pdf", bytes: syntheticPdf("part 4 2"),
    });
    const theme = await db.courseTheme.findUniqueOrThrow({ where: { id: first.themeId } });
    await importSmartCourse(db, {
      ...common, existingThemeId: theme.id, expectedOrderVersion: theme.orderVersion,
      referenceLabel: "4.1", partTitle: "Partie 4.1",
      fileName: "cours.débuts de l'humanité 4.1.pdf", bytes: syntheticPdf("part 4 1"),
    });
    const duplicate = await importSmartCourse(db, {
      ...common, existingThemeId: theme.id, expectedOrderVersion: 2,
      referenceLabel: "4.1", partTitle: "Partie 4.1",
      fileName: "copie 4.1.pdf", bytes: syntheticPdf("part 4 1"),
    });

    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.reusedPart, true);
    assert.equal(await db.courseTheme.count({ where: { userId: userA } }), 1);
    const parts = await db.coursePart.findMany({ where: { userId: userA }, orderBy: { position: "asc" } });
    assert.deepEqual(parts.map((part) => part.referenceLabel), ["4.1", "4.2"]);
    assert.ok(parts.every((part) => part.chapterId === null));
    assert.equal(await db.chapter.count({ where: { userId: userA } }), 0);
    assert.equal(await db.sourceAsset.count({ where: { userId: userA } }), 2);
    assert.equal(await db.sourceImport.count({ where: { userId: userA } }), 3);
    assert.equal(await db.sourcePlacement.count({ where: { userId: userA } }), 2);
    assert.equal((await readdir(directory)).length, 2);

    const before = {
      themes: await db.courseTheme.count({ where: { userId: userA } }),
      parts: await db.coursePart.count({ where: { userId: userA } }),
      assets: await db.sourceAsset.count({ where: { userId: userA } }),
    };
    await assert.rejects(importSmartCourse(db, {
      ...common, subjectId: subjectB.id, courseTitle: "Cours étranger",
      referenceLabel: "1.1", partTitle: "Partie 1.1",
      fileName: "foreign.pdf", bytes: syntheticPdf("foreign"),
    }), /not-found/);
    await assert.rejects(importSmartCourse(db, {
      ...common, courseTitle: "Cours publication impossible",
      referenceLabel: "9.1", partTitle: "Partie 9.1",
      fileName: "failure.pdf", bytes: syntheticPdf("failure"),
    }, { ...storage, finalizeSourceFile: async () => { throw new Error("synthetic publication failure"); } }));
    assert.deepEqual({
      themes: await db.courseTheme.count({ where: { userId: userA } }),
      parts: await db.coursePart.count({ where: { userId: userA } }),
      assets: await db.sourceAsset.count({ where: { userId: userA } }),
    }, before);
  } finally {
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.$disconnect();
    if (previousRoot === undefined) delete process.env.SOURCE_STORAGE_ROOT;
    else process.env.SOURCE_STORAGE_ROOT = previousRoot;
    await rm(directory, { recursive: true, force: true });
  }
});
