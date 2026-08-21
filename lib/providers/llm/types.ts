export type DeliveryType =
  | "IMMERSIVE_STORY"
  | "COURSE_SUMMARY"
  | "MEMORY_AUDIO_CARD"
  | "REVIEW_QA";

export type ResponseMode = "EXPLAIN" | "STORY" | "REVIEW" | "QUICK";
export type VocabularyLevel = "VERY_SIMPLE" | "COMMON" | "PRECISE";
export type AdaptationMode = "STANDARD" | "FOCUS" | "EASY_READING" | "MEMORY";
export type ResearchMode = "NONE" | "AUTO" | "REQUIRED";

export type LearningContentSource = {
  url: string;
  title?: string;
  domain?: string;
  sourceOrder: number;
  citationStart?: number;
  citationEnd?: number;
};

export type LearningContentInput = {
  title: string;
  userRequest: string;
  audience: string;
  level: string;
  vocabularyLevel: VocabularyLevel;
  adaptationMode: AdaptationMode;
  responseMode: ResponseMode;
  researchMode: ResearchMode;
};

export type LearningContentResult = {
  content: string;
  researchUsed: boolean;
  sources: LearningContentSource[];
};

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
  generateLearningContent(input: LearningContentInput): Promise<LearningContentResult>;
}
