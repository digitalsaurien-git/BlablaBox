import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OpenAILLMProvider } from "../lib/providers/llm/openai-provider.ts";

const input = {
  title: "Les cellules humaines",
  userRequest: "Explique-moi les cellules humaines avec des sources actuelles",
  audience: "Collège",
  level: "Intermédiaire",
  vocabularyLevel: "COMMON",
  adaptationMode: "FOCUS",
  responseMode: "EXPLAIN",
  researchMode: "AUTO",
};

test("OpenAI transmet AUTO et conserve uniquement les sources citées sans appel réel", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              { type: "url", url: "https://www.example.org/cellules", title: "Cellules" },
              { type: "url", url: "https://example.net/biologie" },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Une cellule est une unité du vivant.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://www.example.org/cellules",
                  title: "Cellules humaines",
                  start_index: 0,
                  end_index: 11,
                },
              ],
            },
          ],
        },
      ],
    });
  };

  try {
    const result = await new OpenAILLMProvider({
      apiKey: "test-key",
      model: "test-model",
      webSearchEnabled: true,
    }).generateLearningContent(input);
    assert.equal(requestBody.tool_choice, "auto");
    assert.deepEqual(requestBody.tools, [{ type: "web_search" }]);
    assert.equal(requestBody.include, undefined);
    assert.match(requestBody.input, /Concentration|séquences courtes/i);
    assert.equal(result.content, "Une cellule [1] est une unité du vivant.");
    assert.equal(result.researchUsed, true);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].domain, "example.org");
    assert.equal(result.sources[0].citationStart, result.content.indexOf("[1]"));
    assert.ok(result.sources.every((source) => source.domain !== "example.net"));
    assert.match(requestBody.input, /N'ajoute aucune section finale Sources/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("STORY avec NONE n'envoie aucun outil Web Search", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ output_text: "Il était une fois..." });
  };
  try {
    const result = await new OpenAILLMProvider({
      apiKey: "test-key",
      webSearchEnabled: true,
    }).generateLearningContent({ ...input, responseMode: "STORY", researchMode: "NONE" });
    assert.equal(requestBody.tools, undefined);
    assert.equal(requestBody.tool_choice, undefined);
    assert.equal(result.researchUsed, false);
    assert.deepEqual(result.sources, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("REQUIRED échoue clairement si Web Search est désactivé", async () => {
  const provider = new OpenAILLMProvider({ apiKey: "test-key", webSearchEnabled: false });
  await assert.rejects(
    provider.generateLearningContent({ ...input, researchMode: "REQUIRED" }),
    /WEB_SEARCH_ENABLED/,
  );
});

test("le mock couvre le contrat pédagogique sans réseau", async () => {
  const source = await readFile("lib/providers/llm/mock-learning-provider.ts", "utf8");
  assert.match(source, /generateLearningContent/);
  assert.match(source, /Une idée à la fois/);
  assert.match(source, /researchMode === "REQUIRED"/);
  assert.match(source, /example\.test\/source-documentaire/);
});
