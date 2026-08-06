export type SpeechGenerationInput = {
  script: string;
  outputFilePath: string;
};

export type SpeechGenerationResult = {
  format: "mp3";
  durationSeconds?: number;
};

export interface TTSProvider {
  generateSpeech(input: SpeechGenerationInput): Promise<SpeechGenerationResult>;
}
