import { writeFile } from "node:fs/promises";
import type { SpeechGenerationInput, SpeechGenerationResult, TTSProvider } from "./types";

export class OpenAITTSProvider implements TTSProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voice: string;

  constructor(options?: { apiKey?: string; model?: string; voice?: string }) {
    this.apiKey = options?.apiKey ?? process.env.TTS_API_KEY ?? "";
    this.model = options?.model ?? process.env.TTS_MODEL ?? "gpt-4o-mini-tts";
    this.voice = options?.voice ?? process.env.TTS_VOICE ?? "coral";
  }

  async generateSpeech(input: SpeechGenerationInput): Promise<SpeechGenerationResult> {
    if (!this.apiKey) {
      throw new Error("TTS_PROVIDER=openai nécessite TTS_API_KEY.");
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        voice: this.voice,
        input: input.script,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      throw new Error(`La génération audio OpenAI a échoué (${response.status}).`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) {
      throw new Error("Le provider OpenAI a renvoyé un fichier audio vide.");
    }

    await writeFile(input.outputFilePath, audio, { flag: "wx" });
    return { format: "mp3" };
  }
}
