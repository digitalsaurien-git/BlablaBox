import assert from "node:assert/strict";
import test from "node:test";
import { compareNaturalReferences, parseNaturalSegments, sortCourseParts, suggestReferenceFromFilename } from "../lib/courses/ordering.ts";
import { parseExpectedVersion, readCourseText } from "../lib/courses/validation.ts";

test("les versions et segments hors bornes sont refusés sans conversion décimale", () => {
  for (const value of ["", " ", "-1", "1.5", "1e2", "2147483647"]) assert.equal(parseExpectedVersion(value), null);
  assert.equal(parseExpectedVersion("10"), 10);
  assert.deepEqual(parseNaturalSegments("4.999999999999999999999"), []);
  assert.equal(readCourseText("a".repeat(81), "", 80), "");
  assert.equal(readCourseText(" Année  scolaire ", "", 80), "Année scolaire");
});

test("les repères numériques utilisent un tri naturel", () => {
  const parts = ["4.10", "4.2", "4.1"].map((referenceLabel, position) => ({ referenceLabel, position }));
  assert.deepEqual(sortCourseParts(parts).map((part) => part.referenceLabel), ["4.1", "4.2", "4.10"]);
  assert.deepEqual(parseNaturalSegments("4.10"), [4, 10]);
});

test("les repères atypiques restent manuels", () => {
  assert.deepEqual(parseNaturalSegments("4 bis"), []);
  assert.deepEqual(sortCourseParts([
    { referenceLabel: "Introduction", position: 0 },
    { referenceLabel: "4.1", position: 1 },
  ]).map((part) => part.referenceLabel), ["4.1", "Introduction"]);
});

test("la suggestion de classement vient seulement du nom du fichier", () => {
  assert.equal(suggestReferenceFromFilename("cours.débuts de l'humanité 4.2.pdf"), "4.2");
  assert.equal(suggestReferenceFromFilename("chapitre 4.10.odt"), "4.10");
  assert.equal(suggestReferenceFromFilename("cours-introduction.pdf"), null);
});

test("la comparaison conserve une position confirmée comme départage", () => {
  assert.equal(compareNaturalReferences({ referenceLabel: null, position: 0 }, { referenceLabel: null, position: 1 }), -1);
});
