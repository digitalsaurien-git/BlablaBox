import assert from "node:assert/strict";
import test from "node:test";
import { MockLLMProvider } from "../lib/providers/llm/mock-provider.ts";
import { OpenAILLMProvider } from "../lib/providers/llm/openai-provider.ts";

const input = {
  title: "Photosynthèse",
  sourceContent: "Les plantes utilisent la lumière pour produire de la matière organique.",
  targetDurationMinutes: 3,
  audience: "Collège",
  tone: "Clair et vivant",
  level: "Intermediaire",
  learningObjective: "Comprendre le principe général",
  deliveryType: "COURSE_SUMMARY",
};

test("le provider LLM mock génère un script pédagogique", async () => {
  const result = await new MockLLMProvider().generateAudioScript(input);
  assert.ok(result.script.length > 500);
  assert.match(result.script, /Objectif de l'ecoute/i);
});

test("OpenAI LLM échoue clairement sans clé", async () => {
  await assert.rejects(
    new OpenAILLMProvider({ apiKey: "" }).generateAudioScript(input),
    /LLM_API_KEY/,
  );
});

test("OpenAI LLM utilise la Responses API sans appel réel", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    requestBody = JSON.parse(options.body);
    return Response.json({ output_text: "Script réel simulé" });
  };
  try {
    const result = await new OpenAILLMProvider({ apiKey: "test-key", model: "test-model" }).generateAudioScript(input);
    assert.equal(result.script, "Script réel simulé");
    assert.equal(requestBody.model, "test-model");
    assert.match(requestBody.input, /N'invente jamais de faits/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
