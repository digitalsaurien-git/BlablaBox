import { MockLLMProvider } from "./mock-provider";
import { OpenAILLMProvider } from "./openai-provider";
import type { LLMProvider } from "./types";

export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER ?? "mock").trim().toLowerCase();

  if (!provider || provider === "mock") {
    return new MockLLMProvider();
  }

  if (provider === "openai") {
    return new OpenAILLMProvider();
  }

  throw new Error(
    `LLM_PROVIDER invalide : ${provider}. Valeurs supportées : mock, openai.`,
  );
}

export type {
  DeliveryType,
  LLMProvider,
  ScriptGenerationInput,
  ScriptGenerationResult,
} from "./types";