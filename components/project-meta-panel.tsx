const deliveryTypeLabels: Record<string, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Résumé de cours",
  MEMORY_AUDIO_CARD: "Fiche audio de mémorisation",
  REVIEW_QA: "Questions-réponses de révision",
};

const responseModeLabels: Record<string, string> = {
  EXPLAIN: "Expliquer",
  STORY: "Histoire",
  REVIEW: "Réviser",
  QUICK: "Réponse rapide",
};

const vocabularyLabels: Record<string, string> = {
  VERY_SIMPLE: "Très simple",
  COMMON: "Courant",
  PRECISE: "Précis",
};

const adaptationLabels: Record<string, string> = {
  STANDARD: "Standard",
  FOCUS: "Concentration",
  EASY_READING: "Lecture facilitée",
  MEMORY: "Mémorisation",
};

const audioStatusLabels: Record<string, string> = {
  NOT_GENERATED: "À générer",
  PENDING: "En cours",
  GENERATED: "Prêt",
  FAILED: "À réessayer",
};

type ProjectMetaPanelProps = {
  project: {
    projectKind: string;
    targetDurationMinutes: number;
    deliveryType: string;
    responseMode: string | null;
    audience: string;
    tone: string;
    level: string;
    vocabularyLevel: string;
    adaptationMode: string;
    researchMode: string;
    audioStatus: string;
    contentVersion: number;
    createdAt: Date;
    updatedAt: Date;
  };
};

export function ProjectMetaPanel({ project }: ProjectMetaPanelProps) {
  const isUnderstand = project.projectKind === "UNDERSTAND_LISTEN";
  const items = isUnderstand
    ? [
        ["Réponse", responseModeLabels[project.responseMode ?? ""] ?? "Expliquer"],
        ["Public", project.audience],
        ["Niveau", project.level],
        ["Vocabulaire", vocabularyLabels[project.vocabularyLevel] ?? project.vocabularyLevel],
        ["Adaptation", adaptationLabels[project.adaptationMode] ?? project.adaptationMode],
        ["Recherche", project.researchMode === "REQUIRED" ? "Requise" : project.researchMode === "AUTO" ? "Automatique" : "Non"],
        ["Version", String(project.contentVersion)],
        ["Audio", audioStatusLabels[project.audioStatus] ?? project.audioStatus],
      ]
    : [
        ["Type", deliveryTypeLabels[project.deliveryType] ?? "Résumé de cours"],
        ["Durée", `${project.targetDurationMinutes} minutes`],
        ["Public", project.audience],
        ["Ton", project.tone],
        ["Niveau", project.level],
        ["Version", String(project.contentVersion)],
        ["Audio", audioStatusLabels[project.audioStatus] ?? project.audioStatus],
      ];

  return (
    <section className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Paramètres</h2>
        <p className="mt-1 text-sm text-ink/60">
          Créé le {new Intl.DateTimeFormat("fr-FR").format(project.createdAt)} · mis à jour le {new Intl.DateTimeFormat("fr-FR").format(project.updatedAt)}
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-mist px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink/55">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
