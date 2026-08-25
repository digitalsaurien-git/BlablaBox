import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCitedLearningContent,
  normalizeSourceUrl,
} from "../lib/source-citations.ts";

test("la normalisation retire le tracking sans supprimer les paramètres fonctionnels", () => {
  assert.equal(
    normalizeSourceUrl("https://example.org/article?id=42&utm_source=openai&utm_campaign=test#section"),
    "https://example.org/article?id=42",
  );
});

test("les URL équivalentes sont dédupliquées et moins de huit sources restent moins de huit", () => {
  const rawContent = "Premier fait. Deuxième fait.";
  const result = formatCitedLearningContent(rawContent, [
    {
      url: "https://example.org/page?utm_source=openai",
      title: "Référence",
      startIndex: 0,
      endIndex: 13,
    },
    {
      url: "https://example.org/page",
      title: "Doublon",
      startIndex: 14,
      endIndex: rawContent.length,
    },
  ]);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://example.org/page");
  assert.equal(result.sources[0].sourceOrder, 0);
  assert.match(result.content, /\[1\]/);
});

test("les citations deviennent des marqueurs propres correspondant aux ProjectSource", () => {
  const visibleCitation = "([khanacademy.org]([https://fr.khanacademy.org/science](https://fr.khanacademy.org/science)))";
  const rawContent = `Les mitochondries fournissent de l'énergie. ${visibleCitation}\n\nSources\n- https://fr.khanacademy.org/science`;
  const startIndex = rawContent.indexOf(visibleCitation);
  const result = formatCitedLearningContent(rawContent, [
    {
      url: "https://fr.khanacademy.org/science?utm_source=openai",
      title: "Khan Academy",
      startIndex,
      endIndex: startIndex + visibleCitation.length,
    },
  ]);

  assert.equal(result.sources.length, 1);
  assert.match(result.content, /énergie\. \[1\]/);
  assert.doesNotMatch(result.content, /https?:\/\//);
  assert.doesNotMatch(result.content, /\]\(\[/);
  assert.doesNotMatch(result.content, /\nSources\n/i);
  assert.equal(result.sources[0].citationStart, result.content.indexOf("[1]"));
  assert.equal(result.sources[0].citationEnd, result.content.indexOf("[1]") + 3);
});

test("huit sources citées au maximum sont retenues avec priorité à la qualité", () => {
  const citations = [];
  const parts = [];
  const urls = [
    "https://reddit.com/r/test/comment",
    "https://example1.com/article",
    "https://example2.com/article",
    "https://example3.com/article",
    "https://example4.com/article",
    "https://example5.com/article",
    "https://example6.com/article",
    "https://example7.com/article",
    "https://www.nih.gov/reference",
  ];
  let offset = 0;
  for (const [index, url] of urls.entries()) {
    const part = `Fait ${index + 1}.`;
    parts.push(part);
    citations.push({ url, startIndex: offset, endIndex: offset + part.length });
    offset += part.length + 1;
  }
  const result = formatCitedLearningContent(parts.join(" "), citations);
  assert.equal(result.sources.length, 8);
  assert.ok(result.sources.some((source) => source.domain === "nih.gov"));
  assert.ok(result.sources.every((source) => source.domain !== "reddit.com"));
  assert.deepEqual(result.sources.map((source) => source.sourceOrder), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("les marqueurs sont remappés de 1 à N sans orphelins et une même source garde son numéro", () => {
  const rawContent = "Fait A [9]. Même source encore [10]. Fait B.";
  const firstStart = rawContent.indexOf("Fait A");
  const secondStart = rawContent.indexOf("Même source");
  const result = formatCitedLearningContent(rawContent, [
    {
      url: "https://example.org/biology?utm_source=openai",
      startIndex: firstStart,
      endIndex: firstStart + "Fait A".length,
    },
    {
      url: "https://example.org/biology",
      startIndex: secondStart,
      endIndex: secondStart + "Même source encore".length,
    },
    {
      url: "https://example.net/other",
      startIndex: rawContent.indexOf("Fait B"),
      endIndex: rawContent.length,
    },
  ]);
  const markers = [...result.content.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  assert.equal(result.sources.length, 2);
  assert.ok(markers.length >= 3);
  assert.ok(markers.every((marker) => marker >= 1 && marker <= result.sources.length));
  assert.equal(markers.filter((marker) => marker === 1).length, 2);
  assert.doesNotMatch(result.content, /\[(?:[3-9]|\d{2,})\]/);
  assert.deepEqual(result.sources.map((source) => source.sourceOrder), [0, 1]);
});

test("aucune source non annotée n'est inventée", () => {
  const result = formatCitedLearningContent(
    "Réponse sans citation. ([site.test]([https://site.test](https://site.test)))",
    [],
  );
  assert.deepEqual(result.sources, []);
  assert.equal(result.content, "Réponse sans citation. site.test");
  assert.doesNotMatch(result.content, /\]\(|https?:\/\//);
});
