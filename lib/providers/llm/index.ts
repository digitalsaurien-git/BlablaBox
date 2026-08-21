import { LearningContentMockProvider } from "./mock-learning-provider";
import { OpenAILLMProvider } from "./openai-provider";
import type { LLMProvider } from "./types";

export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER ?? "mock").trim().toLowerCase();

  if (!provider || provider === "mock") {
    return new LearningContentMockProvider();
  }

  if (provider === "openai") {
    return new OpenAILLMProvider();
  }

  throw new Error(
    `LLM_PROVIDER invalide : ${provider}. Valeurs supportées : mock, openai.`,
  );
}

export type {
  AdaptationMode,
  DeliveryType,
  LearningContentInput,
  LearningContentResult,
  LearningContentSource,
  LLMProvider,
  ResearchMode,
  ResponseMode,
  ScriptGenerationInput,
  ScriptGenerationResult,
  VocabularyLevel,
} from "./types";
