import { MockLLMProvider } from "./mock-provider";
import type {
  LearningContentInput,
  LearningContentResult,
  LLMProvider,
} from "./types";

export class LearningContentMockProvider
  extends MockLLMProvider
  implements LLMProvider
{
  async generateLearningContent(
    input: LearningContentInput,
  ): Promise<LearningContentResult> {
    const adaptation = {
      STANDARD: "Nous avançons avec une structure claire et progressive.",
      FOCUS: "Une idée à la fois : commençons par le point essentiel.",
      EASY_READING: "Les phrases restent courtes. Chaque paragraphe porte une seule idée.",
      MEMORY: "Mot-clé : comprendre. Reformule ensuite l'idée avec tes propres mots.",
    }[input.adaptationMode];
    const responseLead = {
      EXPLAIN: "Voici une explication simple et structurée.",
      STORY: "Voici une histoire qui rend le sujet vivant.",
      REVIEW: "Voici une révision active avec les idées à retenir.",
      QUICK: "Voici l'essentiel en quelques lignes.",
    }[input.responseMode];
    const researchUsed = input.researchMode === "REQUIRED";

    return {
      content: [
        input.title,
        "",
        responseLead,
        `Demande : ${input.userRequest}`,
        `Cette réponse est adaptée au public ${input.audience}, au niveau ${input.level} et au vocabulaire ${input.vocabularyLevel.toLowerCase()}.`,
        adaptation,
        "",
        "Idée principale",
        "Le sujet se comprend mieux lorsque l'on part d'un repère concret, puis que l'on relie progressivement les nouvelles informations.",
        "",
        "À retenir",
        "Résume le sujet en une phrase, puis explique-le avec un exemple simple.",
      ].join("\n"),
      researchUsed,
      sources: researchUsed
        ? [
            {
              url: "https://example.test/source-documentaire",
              title: "Source documentaire de démonstration",
              domain: "example.test",
              sourceOrder: 0,
            },
          ]
        : [],
    };
  }
}
