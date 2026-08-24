import assert from "node:assert/strict";
import test from "node:test";
import { resolveResearchMode } from "../lib/research-policy.ts";

test("EXPLAIN, REVIEW et QUICK utilisent AUTO par défaut", () => {
  assert.equal(resolveResearchMode("EXPLAIN", "Explique-moi les cellules humaines"), "AUTO");
  assert.equal(resolveResearchMode("REVIEW", "Fais-moi réviser le système solaire"), "AUTO");
  assert.equal(resolveResearchMode("QUICK", "Qu'est-ce qu'une mitochondrie ?"), "AUTO");
});

test("une histoire créative utilise NONE", () => {
  assert.equal(resolveResearchMode("STORY", "Invente une aventure avec un dragon bleu"), "NONE");
});

test("une demande actuelle, sourcée ou vérifiée utilise REQUIRED", () => {
  assert.equal(resolveResearchMode("EXPLAIN", "Donne-moi des sources actuelles sur ce sujet"), "REQUIRED");
  assert.equal(resolveResearchMode("STORY", "Raconte cette histoire avec des faits vérifiés"), "REQUIRED");
  assert.equal(resolveResearchMode("QUICK", "Qui est le président actuellement ?"), "REQUIRED");
  assert.equal(resolveResearchMode("QUICK", "Quel est le prix du bitcoin ?"), "REQUIRED");
});
