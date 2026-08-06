import type {
  DeliveryType,
  LLMProvider,
  ScriptGenerationInput,
  ScriptGenerationResult,
} from "./types";

const deliveryTypeLabels: Record<DeliveryType, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Résumé de cours",
  MEMORY_AUDIO_CARD: "Fiche audio de mémorisation",
  REVIEW_QA: "Questions-réponses de révision",
};

type OpenAIResponsesBody = {
  model: string;
  input: string;
};

type OpenAIResponsesResult = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

export class OpenAILLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.LLM_API_KEY ?? "";
    this.model = options?.model ?? process.env.LLM_MODEL ?? "gpt-5-mini";
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
      body: JSON.stringify(this.buildRequestBody(input)),
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

  private buildRequestBody(input: ScriptGenerationInput): OpenAIResponsesBody {
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
}
