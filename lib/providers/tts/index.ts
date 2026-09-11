import { OpenAITTSProvider } from "./openai-provider.ts";
import { writeFile } from "node:fs/promises";
import type { SpeechGenerationInput, SpeechGenerationResult, TTSProvider } from "./types";

class DisabledTTSProvider implements TTSProvider {
  async generateSpeech(): Promise<never> {
    throw new Error("La génération audio est désactivée. Configurez TTS_PROVIDER=openai.");
  }
}

class MockTTSProvider implements TTSProvider {
  async generateSpeech(input: SpeechGenerationInput): Promise<SpeechGenerationResult> {
    // Deterministic, network-free fixture bytes. The transport and cache are
    // what this provider exercises; production speech remains opt-in.
    const bytes = Buffer.concat([Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000"), Buffer.alloc(512)]);
    await writeFile(input.outputFilePath, bytes, { flag: "wx" });
    return { format: "mp3", durationSeconds: Math.max(1, Math.ceil(input.script.length / 100)) };
  }
}

export function getTTSProvider(): TTSProvider {
  const provider = (process.env.TTS_PROVIDER ?? "disabled").trim().toLowerCase();

  if (!provider || provider === "disabled") return new DisabledTTSProvider();
  if (provider === "mock") return new MockTTSProvider();
  if (provider === "openai") return new OpenAITTSProvider();

  throw new Error(`TTS_PROVIDER invalide : ${provider}. Valeurs supportées : disabled, openai.`);
}

export type { SpeechGenerationInput, SpeechGenerationResult, TTSProvider } from "./types";
