import assert from "node:assert/strict";
import test from "node:test";
import {
  createLearningTitle,
  responseModeToDeliveryType,
  sanitizeLearningSources,
} from "../lib/learning-content.ts";

test("le titre et le DeliveryType restent compatibles avec les anciens projets", () => {
  assert.equal(createLearningTitle("  Comprendre   les cellules  "), "Comprendre les cellules");
  assert.equal(responseModeToDeliveryType("STORY"), "IMMERSIVE_STORY");
  assert.equal(responseModeToDeliveryType("REVIEW"), "REVIEW_QA");
  assert.equal(responseModeToDeliveryType("EXPLAIN"), "COURSE_SUMMARY");
});

test("les sources sont sécurisées, dédupliquées et réordonnées", () => {
  const sources = sanitizeLearningSources([
    { url: "javascript:alert(1)", sourceOrder: 0 },
    { url: "https://www.example.org/article", title: " Article ", sourceOrder: 4, citationStart: 10, citationEnd: 20 },
    { url: "https://www.example.org/article", title: "Doublon", sourceOrder: 5 },
    { url: "https://openai.com/research", sourceOrder: 9 },
  ]);

  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map((source) => source.sourceOrder), [0, 1]);
  assert.equal(sources[0].domain, "example.org");
  assert.equal(sources[0].title, "Article");
  assert.equal(sources[0].citationStart, 10);
  assert.equal(sources[0].citationEnd, 20);
});
