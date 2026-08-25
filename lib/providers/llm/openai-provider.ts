import type {
  AdaptationMode,
  DeliveryType,
  LearningContentInput,
  LearningContentResult,
  LLMProvider,
  ResponseMode,
  ScriptGenerationInput,
  ScriptGenerationResult,
  VocabularyLevel,
} from "./types";
import {
  formatCitedLearningContent,
  type RawUrlCitation,
} from "../../source-citations.ts";

const deliveryTypeLabels: Record<DeliveryType, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Résumé de cours",
  MEMORY_AUDIO_CARD: "Fiche audio de mémorisation",
  REVIEW_QA: "Questions-réponses de révision",
};

const responseModeLabels: Record<ResponseMode, string> = {
  EXPLAIN: "Expliquer un sujet",
  STORY: "Raconter une histoire",
  REVIEW: "Faire réviser",
  QUICK: "Réponse rapide",
};

const vocabularyInstructions: Record<VocabularyLevel, string> = {
  VERY_SIMPLE: "Utilise des mots très simples et explique immédiatement chaque terme nécessaire.",
  COMMON: "Utilise un vocabulaire courant, clair et naturel.",
  PRECISE: "Utilise un vocabulaire précis et définis les termes spécialisés utiles.",
};

const adaptationInstructions: Record<AdaptationMode, string> = {
  STANDARD: "Structure la réponse de façon claire et universelle.",
  FOCUS: "Présente des séquences courtes, une idée à la fois, avec peu de digressions et des transitions explicites.",
  EASY_READING: "Écris des phrases et paragraphes courts, avec des formulations directes et non ambiguës.",
  MEMORY: "Ajoute des mots-clés, des reformulations, des rappels, une synthèse et un mini-quiz lorsque pertinent.",
};

type OpenAIResponsesBody = {
  model: string;
  input: string;
  tools?: Array<{ type: "web_search" }>;
  tool_choice?: "auto" | "required";
};

type OpenAIResponsesResult = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      text?: string;
      type?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        start_index?: number;
        end_index?: number;
      }>;
    }>;
  }>;
};

export class OpenAILLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly webSearchEnabled: boolean;

  constructor(options?: { apiKey?: string; model?: string; webSearchEnabled?: boolean }) {
    this.apiKey = options?.apiKey ?? process.env.LLM_API_KEY ?? "";
    this.model = options?.model ?? process.env.LLM_MODEL ?? "gpt-5-mini";
    this.webSearchEnabled =
      options?.webSearchEnabled ?? process.env.WEB_SEARCH_ENABLED === "true";
  }

  async generateAudioScript(
    input: ScriptGenerationInput,
  ): Promise<ScriptGenerationResult> {
    if (!this.apiKey) {
      throw new Error("LLM_PROVIDER=openai nécessite LLM_API_KEY.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildScriptRequestBody(input)),
    });

    if (!response.ok) {
      throw new Error(`La génération du script OpenAI a échoué (${response.status}).`);
    }

    const data = (await response.json()) as OpenAIResponsesResult;
    const script = this.extractText(data);
    if (!script) {
      throw new Error("Le provider OpenAI n'a pas renvoyé de script exploitable.");
    }

    return {
      script,
      estimatedDurationMinutes: input.targetDurationMinutes,
    };
  }

  async generateLearningContent(
    input: LearningContentInput,
  ): Promise<LearningContentResult> {
    if (!this.apiKey) {
      throw new Error("LLM_PROVIDER=openai nécessite LLM_API_KEY.");
    }

    if (input.researchMode === "REQUIRED" && !this.webSearchEnabled) {
      throw new Error(
        "Cette demande nécessite une recherche documentaire, mais WEB_SEARCH_ENABLED n'est pas activé.",
      );
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildLearningRequestBody(input)),
    });

    if (!response.ok) {
      throw new Error(`La génération OpenAI a échoué (${response.status}).`);
    }

    const data = (await response.json()) as OpenAIResponsesResult;
    const extracted = this.extractCitedLearningContent(data);
    const content = extracted.content;
    if (!content) {
      throw new Error("Le provider OpenAI n'a pas renvoyé de contenu exploitable.");
    }

    const researchUsed = data.output?.some((item) => item.type === "web_search_call") ?? false;
    if (input.researchMode === "REQUIRED" && !researchUsed) {
      throw new Error("La recherche documentaire requise n'a pas été effectuée.");
    }

    const sources = extracted.sources;
    if (researchUsed && sources.length === 0) {
      throw new Error("La recherche documentaire n'a renvoyé aucune source exploitable.");
    }

    return {
      content,
      researchUsed,
      sources,
    };
  }

  private buildScriptRequestBody(input: ScriptGenerationInput): OpenAIResponsesBody {
    return {
      model: this.model,
      input: [
        "Tu es le moteur narratif de BlablaBox.",
        "Génère un script audio pédagogique en français, en texte brut structuré, sans JSON ni Markdown complexe.",
        "Le script doit être clair, vivant, mémorisable et directement compatible avec un futur TTS.",
        "N'invente jamais de faits absents de la source. Si le sujet est trop court, ambigu ou insuffisamment documenté, indique explicitement les limites dans le script et reste sur des formulations prudentes.",
        "Structure attendue : titre audio, accroche orale, objectif, contexte, progression, reformulation, points clés, résumé final, questions de révision, conclusion orientée réécoute.",
        "",
        `Titre : ${input.title}`,
        `Source : ${input.sourceContent}`,
        `Durée cible : ${input.targetDurationMinutes} minutes`,
        `Public cible : ${input.audience}`,
        `Ton : ${input.tone}`,
        `Niveau : ${input.level}`,
        `Objectif pédagogique : ${input.learningObjective}`,
        `Type de restitution : ${deliveryTypeLabels[input.deliveryType]}`,
      ].join("\n"),
    };
  }

  private buildLearningRequestBody(input: LearningContentInput): OpenAIResponsesBody {
    const useWebSearch = this.webSearchEnabled && input.researchMode !== "NONE";
    const body: OpenAIResponsesBody = {
      model: this.model,
      input: [
        "Tu es BlablaBox, un assistant pédagogique francophone, familial et non médicalisant.",
        "Réponds à la demande en texte clair, structuré et directement lisible à l'écran comme à l'oral.",
        "Vise une réponse complète mais suffisamment concise pour tenir sous environ 3 800 caractères.",
        "Ne tronque jamais une phrase et ne prétends jamais avoir vérifié une information sans source.",
        "N'ajoute aucune section finale Sources ou Références : BlablaBox construit cette section depuis les citations structurées.",
        "N'écris aucune URL ni lien Markdown dans la réponse. L'application ajoutera elle-même les marqueurs courts [1], [2] depuis les annotations Web Search.",
        `Type de réponse : ${responseModeLabels[input.responseMode]}.`,
        `Public : ${input.audience}.`,
        `Niveau : ${input.level}.`,
        vocabularyInstructions[input.vocabularyLevel],
        adaptationInstructions[input.adaptationMode],
        input.responseMode === "QUICK"
          ? "Donne directement l'essentiel en quelques paragraphes courts."
          : "Utilise des titres simples lorsque cela aide la compréhension.",
        input.responseMode === "STORY"
          ? "Si la demande est créative, privilégie le récit et n'ajoute pas artificiellement de faits documentaires."
          : "Distingue clairement les faits, les explications et les exemples.",
        "",
        `Demande de l'utilisateur : ${input.userRequest}`,
      ].join("\n"),
    };

    if (useWebSearch) {
      body.tools = [{ type: "web_search" }];
      body.tool_choice = input.researchMode === "REQUIRED" ? "required" : "auto";
    }

    return body;
  }

  private extractText(data: OpenAIResponsesResult): string {
    if (typeof data.output_text === "string") {
      return data.output_text.trim();
    }

    const chunks = data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .filter(Boolean);

    return chunks?.join("\n").trim() ?? "";
  }

  private extractCitedLearningContent(
    data: OpenAIResponsesResult,
  ): Pick<LearningContentResult, "content" | "sources"> {
    const chunks: string[] = [];
    const citations: RawUrlCitation[] = [];
    let offset = 0;

    for (const item of data.output ?? []) {
      for (const content of item.content ?? []) {
        if (!content.text) continue;
        if (chunks.length > 0) offset += 1;
        const blockOffset = offset;
        chunks.push(content.text);
        for (const annotation of content.annotations ?? []) {
          if (annotation.type !== "url_citation" || !annotation.url) continue;
          citations.push({
            url: annotation.url,
            title: annotation.title,
            startIndex: Number.isInteger(annotation.start_index)
              ? blockOffset + annotation.start_index!
              : undefined,
            endIndex: Number.isInteger(annotation.end_index)
              ? blockOffset + annotation.end_index!
              : undefined,
          });
        }
        offset += content.text.length;
      }
    }

    const rawContent = chunks.length > 0 ? chunks.join("\n") : data.output_text ?? "";
    const formatted = formatCitedLearningContent(rawContent, citations);
    return {
      content: formatted.content,
      sources: formatted.sources,
    };
  }
}
