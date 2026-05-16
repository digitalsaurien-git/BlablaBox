const deliveryTypeLabels: Record<string, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Résumé de cours",
  MEMORY_AUDIO_CARD: "Fiche audio de mémorisation",
  REVIEW_QA: "Questions-réponses de révision",
};

const scriptStatusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  SCRIPT_GENERATED: "Script généré",
  SCRIPT_FAILED: "Erreur de génération",
};

const audioStatusLabels: Record<string, string> = {
  NOT_STARTED: "Audio non démarré",
  MOCK_READY: "Prêt pour audio futur",
  PENDING: "Audio en attente",
  GENERATED: "Audio généré",
  FAILED: "Erreur audio",
};

type ProjectMetaPanelProps = {
  project: {
    targetDurationMinutes: number;
    deliveryType: string;
    audience: string;
    tone: string;
    level: string;
    scriptStatus: string;
    audioStatus: string;
    audioFormat: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

export function ProjectMetaPanel({ project }: ProjectMetaPanelProps) {
  const items = [
    ["Type", deliveryTypeLabels[project.deliveryType] ?? "Résumé de cours"],
    ["Durée", `${project.targetDurationMinutes} minutes`],
    ["Public", project.audience],
    ["Ton", project.tone],
    ["Niveau", project.level],
    ["Script", scriptStatusLabels[project.scriptStatus] ?? project.scriptStatus],
    ["Audio", audioStatusLabels[project.audioStatus] ?? project.audioStatus],
    ["Format futur", project.audioFormat ?? "mp3"],
  ];

  return (
    <section className="grid gap-4 rounded-md border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Paramètres pédagogiques</h2>
        <p className="mt-1 text-sm text-ink/60">
          Créé le {new Intl.DateTimeFormat("fr-FR").format(project.createdAt)} · mis à jour le {new Intl.DateTimeFormat("fr-FR").format(project.updatedAt)}
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md bg-mist px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink/55">
              {label}
            </dt>
            <dd className="mt-1 break-words text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}