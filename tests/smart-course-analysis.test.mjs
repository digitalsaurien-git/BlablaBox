import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSmartCourseProposal, cleanCourseTitle, normalizeCourseText, scoreSubject, suggestTheme } from "../lib/courses/smart-analysis.ts";
import { sortCourseParts } from "../lib/courses/ordering.ts";
import { extractDocumentText } from "../lib/sources/text-extraction.ts";
import { ODT_MIME_TYPE, PDF_MIME_TYPE } from "../lib/sources/validation.ts";
import { syntheticOdt, syntheticPdf } from "./helpers/source-fixtures.mjs";

const themes = [
  { id: "theme-humanity", title: "Les débuts de l’humanité", orderVersion: 2, parts: [] },
  { id: "theme-revolution", title: "La Révolution industrielle", orderVersion: 0, parts: [] },
];
const subjects = [
  { id: "history", title: "Histoire-géo", themes },
  { id: "maths", title: "Mathématiques", themes: [] },
  { id: "english", title: "Anglais", themes: [] },
];

test("normalise les variantes de matières, accents, tirets et ponctuation", () => {
  assert.equal(normalizeCourseText("HISTOIRE–GÉO"), "histoire geo");
  assert.equal(normalizeCourseText(" Mathématiques ! "), "mathematiques");
  assert.ok(scoreSubject("Mathématiques", "cours de numeration et nombres entiers") > 0);
});

test("nettoie le titre et regroupe 4.1 et 4.2 dans le même cours", () => {
  assert.equal(cleanCourseTitle("cours.débuts de l'humanité 4.2.pdf"), "Les débuts de l'humanité");
  assert.equal(cleanCourseTitle("cours - Numération 4.10 (1).odt"), "Numération");
  const first = buildSmartCourseProposal({ fileName: "cours.débuts de l'humanité 4.1.pdf", extractedText: "", readableText: false, subjects });
  const second = buildSmartCourseProposal({ fileName: "cours.débuts de l'humanité 4.2.pdf", extractedText: "", readableText: false, subjects });
  assert.equal(first.courseTitle, second.courseTitle);
  assert.equal(first.referenceLabel, "4.1");
  assert.equal(second.referenceLabel, "4.2");
  assert.equal(first.subjects[0].themeSuggestion.themeId, "theme-humanity");
});

test("déduit une matière depuis le nom ou le texte accessible", () => {
  const fromName = buildSmartCourseProposal({ fileName: "Préhistoire et humanité 4.1.pdf", extractedText: "", readableText: false, subjects });
  assert.equal(fromName.suggestedSubjectId, "history");
  const pdf = extractDocumentText(syntheticPdf("English school classroom vocabulary"), PDF_MIME_TYPE);
  const fromText = buildSmartCourseProposal({ fileName: "document.pdf", extractedText: pdf.text, readableText: pdf.readable, subjects });
  assert.equal(fromText.suggestedSubjectId, "english");
});

test("demande une confirmation lorsque la matière ou le cours est incertain", () => {
  const uncertainSubject = buildSmartCourseProposal({ fileName: "document 4.1.pdf", extractedText: "contenu général", readableText: true, subjects });
  assert.equal(uncertainSubject.suggestedSubjectId, null);
  assert.equal(suggestTheme("La Révolution française", themes).kind, "uncertain");
  assert.notEqual(suggestTheme("La Révolution française", themes).kind, "existing");
});

test("réutilise un cours certain et conserve le tri naturel sans chapitre implicite", async () => {
  assert.equal(suggestTheme("Les debuts de l humanite", themes).kind, "existing");
  assert.deepEqual(sortCourseParts(["4.10", "4.2", "4.1"].map((referenceLabel, position) => ({ referenceLabel, position }))).map((part) => part.referenceLabel), ["4.1", "4.2", "4.10"]);
  const mutation = await readFile("lib/courses/smart-import.ts", "utf8");
  assert.match(mutation, /chapterId:\s*null/);
  assert.doesNotMatch(mutation, /chapter\\.create|createChapter/);
});

test("PDF et ODT sont lus localement et un document sans texte reste utilisable", () => {
  const pdf = extractDocumentText(syntheticPdf("Antiquite histoire"), PDF_MIME_TYPE);
  assert.equal(pdf.readable, true);
  assert.match(pdf.text, /Antiquite histoire/);
  const odt = extractDocumentText(syntheticOdt("Nombres entiers et calcul"), ODT_MIME_TYPE);
  assert.equal(odt.readable, true);
  assert.match(odt.text, /Nombres entiers/);
  const imageOnly = extractDocumentText(syntheticOdt(""), ODT_MIME_TYPE);
  assert.equal(imageOnly.readable, false);
  assert.equal(imageOnly.text, "");
});

test("le parcours mobile reste fluide à 320 et 375 px", async () => {
  const component = await readFile("components/smart-course-import.tsx", "utf8");
  assert.match(component, /grid-cols-1/);
  assert.match(component, /min-\[360px\]:grid-cols-2/);
  assert.match(component, /min-w-0/);
  assert.doesNotMatch(component, /min-w-\[(?:3[2-9]\d|[4-9]\d\d)px\]/);
});

test("aucun document ne quitte le serveur et aucun moteur OCR ou LLM n'est appelé", async () => {
  const files = ["app/api/courses/analyze/route.ts", "lib/sources/text-extraction.ts"];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /fetch\(|getLLMProvider|OCR_PROVIDER|openai/i);
  assert.match(source, /MAX_INPUT_BYTES/);
  assert.match(source, /MAX_PDF_PAGES\s*=\s*5/);
  assert.match(source, /MAX_XML_BYTES/);
});
