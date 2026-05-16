import type {
  DeliveryType,
  LLMProvider,
  ScriptGenerationInput,
  ScriptGenerationResult,
} from "./types";

type AudienceKind = "young" | "school" | "adult";
type LevelKind = "simple" | "standard" | "advanced";

type NarrativeProfile = {
  audienceKind: AudienceKind;
  levelKind: LevelKind;
  sentenceStyle: string;
  vocabularyHint: string;
  exampleStyle: string;
  memoryCue: string;
};

const transitionPhrases = [
  "Maintenant que le decor est pose, avancons d'un cran.",
  "Garde cette idee en tete, elle va servir pour la suite.",
  "On peut maintenant relier cette notion a quelque chose de plus concret.",
  "Faisons une pause mentale, puis reformulons avec d'autres mots.",
  "La prochaine etape consiste a comprendre pourquoi ce point compte vraiment.",
  "Ajoutons une image simple pour rendre l'idee plus facile a retrouver en memoire.",
  "On passe maintenant du constat a l'explication.",
  "Pour bien memoriser, attachons cette idee a un repere clair.",
  "Allons un peu plus loin, sans perdre le fil.",
  "Avant de conclure, consolidons ce qui vient d'etre compris.",
];

const sequenceAngles = [
  "le point de depart",
  "l'idee principale",
  "l'exemple qui rend le sujet concret",
  "le lien avec ce que tu sais deja",
  "la nuance importante",
  "l'erreur a eviter",
  "la methode pour retenir",
  "la mise en pratique",
  "le recap intermediaire",
  "la derniere idee a fixer",
];

const deliveryTypeLabels: Record<DeliveryType, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Resume de cours",
  MEMORY_AUDIO_CARD: "Fiche audio de memorisation",
  REVIEW_QA: "Questions-reponses de revision",
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function detectAudience(audience: string): AudienceKind {
  const value = normalize(audience);

  if (value.includes("10") || value.includes("11") || value.includes("12") || value.includes("enfant")) {
    return "young";
  }

  if (value.includes("college") || value.includes("collège") || value.includes("lycee") || value.includes("lycée") || value.includes("eleve") || value.includes("élève")) {
    return "school";
  }

  return "adult";
}

function detectLevel(level: string): LevelKind {
  const value = normalize(level);

  if (value.includes("tres simple") || value.includes("très simple") || value.includes("debutant") || value.includes("débutant")) {
    return "simple";
  }

  if (value.includes("approfondi") || value.includes("avance") || value.includes("avancé")) {
    return "advanced";
  }

  return "standard";
}

function buildProfile(input: ScriptGenerationInput): NarrativeProfile {
  const audienceKind = detectAudience(input.audience);
  const levelKind = detectLevel(input.level);

  const sentenceStyleByAudience: Record<AudienceKind, string> = {
    young: "phrases courtes, images simples et rythme rassurant",
    school: "explication progressive, vocabulaire scolaire et exemples faciles a reutiliser",
    adult: "ton direct, synthese claire et liens utiles pour comprendre vite",
  };

  const vocabularyByLevel: Record<LevelKind, string> = {
    simple: "des mots tres simples et une seule idee forte par passage",
    standard: "un vocabulaire clair, avec les mots importants expliques au bon moment",
    advanced: "des nuances, des causes, des consequences et des liens entre les idees",
  };

  const exampleStyleByAudience: Record<AudienceKind, string> = {
    young: "comme une scene que l'on pourrait imaginer dans une histoire",
    school: "comme un exemple de cours que l'on peut redire a l'oral",
    adult: "comme une situation concrete que l'on peut resumer rapidement",
  };

  const memoryCueByLevel: Record<LevelKind, string> = {
    simple: "un mot-repere facile a repeter",
    standard: "une phrase-repere pour relier les notions",
    advanced: "une chaine logique : contexte, mecanisme, consequence",
  };

  return {
    audienceKind,
    levelKind,
    sentenceStyle: sentenceStyleByAudience[audienceKind],
    vocabularyHint: vocabularyByLevel[levelKind],
    exampleStyle: exampleStyleByAudience[audienceKind],
    memoryCue: memoryCueByLevel[levelKind],
  };
}

function getSequenceCount(minutes: number): number {
  if (minutes <= 3) {
    return 3;
  }

  if (minutes <= 5) {
    return 4;
  }

  if (minutes <= 10) {
    return 6;
  }

  if (minutes <= 15) {
    return 8;
  }

  return 10;
}

function splitSourceIntoIdeas(sourceContent: string, count: number): string[] {
  const cleaned = sourceContent.replace(/\s+/g, " ").trim();
  const rawIdeas = cleaned
    .split(/[.!?;:\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (rawIdeas.length === 0) {
    return Array.from({ length: count }, () => "le sujet principal");
  }

  return Array.from({ length: count }, (_, index) => rawIdeas[index % rawIdeas.length]);
}

function formatSourcePreview(sourceContent: string): string {
  const cleaned = sourceContent.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "Le sujet sera developpe a partir de l'objectif pedagogique fourni.";
  }

  if (cleaned.length <= 520) {
    return cleaned;
  }

  return `${cleaned.slice(0, 500)}...`;
}

function buildSequence(
  idea: string,
  index: number,
  input: ScriptGenerationInput,
  profile: NarrativeProfile,
): string {
  const step = index + 1;
  const angle = sequenceAngles[index % sequenceAngles.length];
  const transition = transitionPhrases[index % transitionPhrases.length];

  const depthLineByLevel: Record<LevelKind, string> = {
    simple: `Dit autrement : ${idea} devient une idee simple que l'on peut redire sans se perdre.`,
    standard: `L'important est de comprendre ce que cette idee explique, puis de la rattacher a l'objectif : ${input.learningObjective}.`,
    advanced: "On peut aller plus loin en cherchant la cause, la consequence et le lien avec l'ensemble du sujet.",
  };

  const audienceLineByKind: Record<AudienceKind, string> = {
    young: "Imagine une petite scene : tu vois le probleme, puis tu reperes l'action qui permet d'avancer.",
    school: "Dans une copie ou a l'oral, ce passage sert a montrer que tu connais le vocabulaire et que tu sais l'expliquer.",
    adult: "Pour le retenir efficacement, transforme ce passage en decision simple : qu'est-ce que je dois comprendre, puis reutiliser ?",
  };

  return [
    `Sequence ${step} - ${angle}`,
    transition,
    `Idee de depart : ${idea}.`,
    `On l'explique avec ${profile.vocabularyHint}.`,
    depthLineByLevel[profile.levelKind],
    `Exemple mental : pense a cette idee ${profile.exampleStyle}.`,
    audienceLineByKind[profile.audienceKind],
    `Phrase a garder : ${profile.memoryCue}.`,
  ].join("\n");
}

function buildReviewQuestions(input: ScriptGenerationInput, ideas: string[]): string[] {
  const mainIdea = ideas[0] ?? input.learningObjective;
  const secondIdea = ideas[1] ?? input.sourceContent;

  return [
    "1. Quel est l'objectif principal de cette ecoute ?",
    `2. Comment expliquerais-tu simplement : ${mainIdea} ?`,
    "3. Quel exemple mental peut t'aider a retenir le sujet ?",
    `4. Quelle difference fais-tu entre le point de depart et l'idee importante : ${secondIdea} ?`,
    "5. Si tu devais resumer le sujet en une phrase, laquelle choisirais-tu ?",
  ];
}

function buildOpening(input: ScriptGenerationInput, profile: NarrativeProfile): string[] {
  const label = deliveryTypeLabels[input.deliveryType];
  const openings: Record<DeliveryType, string> = {
    IMMERSIVE_STORY: "Imagine que tu entres dans une scene ou le sujet devient vivant. On va suivre un fil narratif pour comprendre sans avoir l'impression de lire une fiche.",
    COURSE_SUMMARY: "Installe-toi quelques instants. On va transformer le sujet en resume de cours vivant et pedagogique, pense pour etre ecoute, reecoute et retenu.",
    MEMORY_AUDIO_CARD: "Prepare-toi a retenir l'essentiel. Cet audio va fonctionner comme une fiche de memorisation orale, avec des mots cles et des rappels courts.",
    REVIEW_QA: "On va reviser activement. Je pose les questions, je laisse une courte pause mentale, puis je donne une reponse claire a retenir.",
  };

  return [
    "Accroche orale",
    openings[input.deliveryType],
    `Format choisi : ${label}.`,
    `Le ton choisi est ${input.tone.toLowerCase()}, avec ${profile.sentenceStyle}.`,
  ];
}

function buildBody(
  input: ScriptGenerationInput,
  profile: NarrativeProfile,
  ideas: string[],
): string {
  if (input.deliveryType === "IMMERSIVE_STORY") {
    return ideas
      .map((idea, index) => {
        const step = index + 1;
        return [
          `Scene ${step} - ${sequenceAngles[index % sequenceAngles.length]}`,
          transitionPhrases[index % transitionPhrases.length],
          `Dans cette scene, le sujet prend forme autour de cette idee : ${idea}.`,
          `On l'imagine ${profile.exampleStyle}, pour que l'information devienne plus facile a retenir.`,
          `Le repere narratif a garder est simple : ${profile.memoryCue}.`,
        ].join("\n");
      })
      .join("\n\n");
  }

  if (input.deliveryType === "MEMORY_AUDIO_CARD") {
    return ideas
      .map((idea, index) => {
        const step = index + 1;
        return [
          `Carte memoire ${step}`,
          `Mot-cle : ${sequenceAngles[index % sequenceAngles.length]}.`,
          `Idee a retenir : ${idea}.`,
          `Repetition utile : ${idea} se retient mieux si tu l'associes a ${profile.memoryCue}.`,
          "Pause active : redis cette idee avec tes propres mots avant de continuer.",
        ].join("\n");
      })
      .join("\n\n");
  }

  if (input.deliveryType === "REVIEW_QA") {
    return ideas
      .map((idea, index) => {
        const step = index + 1;
        return [
          `Question ${step}`,
          `Que faut-il comprendre a propos de : ${idea} ?`,
          "Reponse guidee : il faut identifier l'idee, la reformuler simplement, puis la relier a l'objectif de revision.",
          `Reformulation attendue : ${idea} devient un point clair que je peux expliquer a l'oral.`,
        ].join("\n");
      })
      .join("\n\n");
  }

  return ideas
    .map((idea, index) => buildSequence(idea, index, input, profile))
    .join("\n\n");
}

export class MockLLMProvider implements LLMProvider {
  async generateAudioScript(
    input: ScriptGenerationInput,
  ): Promise<ScriptGenerationResult> {
    const minutes = input.targetDurationMinutes;
    const sequenceCount = getSequenceCount(minutes);
    const profile = buildProfile(input);
    const ideas = splitSourceIntoIdeas(input.sourceContent, sequenceCount);
    const sourcePreview = formatSourcePreview(input.sourceContent);
    const body = buildBody(input, profile, ideas);
    const reviewQuestions = buildReviewQuestions(input, ideas)
      .slice(0, minutes <= 3 ? 3 : 5)
      .join("\n");

    return {
      estimatedDurationMinutes: minutes,
      script: [
        `Titre audio : ${input.title}`,
        "",
        ...buildOpening(input, profile),
        "",
        "Objectif de l'ecoute",
        `A la fin de ces ${minutes} minutes environ, l'objectif est clair : ${input.learningObjective}.`,
        `On va avancer progressivement, en gardant ${profile.vocabularyHint}.`,
        "",
        "Contexte",
        `Voici la matiere de depart : ${sourcePreview}`,
        `Pour ${input.audience.toLowerCase()}, le plus utile est de partir d'une idee simple, puis de construire autour d'elle des reperes faciles a retrouver.`,
        "",
        body,
        "",
        "Reformulation simple",
        "Si l'on simplifie au maximum, ce sujet raconte surtout ceci : il y a une idee de depart, une progression a comprendre, puis quelques mots cles a garder en memoire.",
        "Pour ne pas se disperser, retiens d'abord l'objectif, ensuite les etapes, puis l'exemple mental qui rend le tout plus concret.",
        "",
        "Points cles a retenir",
        `1. Le sujet doit etre rattache a l'objectif : ${input.learningObjective}.`,
        `2. Le format ${deliveryTypeLabels[input.deliveryType].toLowerCase()} aide a travailler le sujet sous un angle precis.`,
        "3. La memorisation devient plus facile quand on associe un mot-cle, une image et une reformulation orale.",
        "",
        "Mini-resume final",
        "En resume, tu peux retenir que ce sujet se comprend par etapes. On commence par le contexte, on identifie les idees fortes, puis on les reformule simplement pour pouvoir les redire sans relire tout le texte.",
        "",
        "Questions de revision",
        reviewQuestions,
        "",
        "Conclusion orientee reecoute",
        "A la premiere ecoute, concentre-toi sur le fil general. A la deuxieme, repere les mots cles. A la troisieme, essaie de repondre aux questions sans regarder le script. C'est cette repetition active qui transforme le contenu en souvenir utilisable.",
      ].join("\n"),
    };
  }
}