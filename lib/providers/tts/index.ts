import { OpenAITTSProvider } from "./openai-provider";
import type { TTSProvider } from "./types";

class DisabledTTSProvider implements TTSProvider {
  async generateSpeech(): Promise<never> {
    throw new Error("La génération audio est désactivée. Configurez TTS_PROVIDER=openai.");
  }
}

export function getTTSProvider(): TTSProvider {
  const provider = (process.env.TTS_PROVIDER ?? "disabled").trim().toLowerCase();

  if (!provider || provider === "disabled") return new DisabledTTSProvider();
  if (provider === "openai") return new OpenAITTSProvider();

  throw new Error(`TTS_PROVIDER invalide : ${provider}. Valeurs supportées : disabled, openai.`);
}

export type { SpeechGenerationInput, SpeechGenerationResult, TTSProvider } from "./types";
