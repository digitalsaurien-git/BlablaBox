export type DeliveryType =
  | "IMMERSIVE_STORY"
  | "COURSE_SUMMARY"
  | "MEMORY_AUDIO_CARD"
  | "REVIEW_QA";

export type ScriptGenerationInput = {
  title: string;
  sourceContent: string;
  targetDurationMinutes: number;
  audience: string;
  tone: string;
  level: string;
  learningObjective: string;
  deliveryType: DeliveryType;
};

export type ScriptGenerationResult = {
  script: string;
  estimatedDurationMinutes: number;
};

export interface LLMProvider {
  generateAudioScript(input: ScriptGenerationInput): Promise<ScriptGenerationResult>;
}