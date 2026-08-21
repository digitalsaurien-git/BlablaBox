import Link from "next/link";

const responseLabels: Record<string, string> = {
  EXPLAIN: "Explication",
  STORY: "Histoire",
  REVIEW: "Révision",
  QUICK: "Réponse rapide",
};

const deliveryLabels: Record<string, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Résumé de cours",
  MEMORY_AUDIO_CARD: "Fiche mémoire",
  REVIEW_QA: "Questions-réponses",
};

type ProjectCardProps = {
  project: {
    id: string;
    title: string;
    projectKind: string;
    responseMode: string | null;
    deliveryType: string;
    audience: string;
    contentVersion: number;
    audioContentVersion: number | null;
    audioFilePath: string | null;
    createdAt: Date;
  };
};

export function ProjectCard({ project }: ProjectCardProps) {
  const isUnderstand = project.projectKind === "UNDERSTAND_LISTEN";
  const hasSynchronizedAudio =
    Boolean(project.audioFilePath) &&
    project.audioContentVersion !== null &&
    project.audioContentVersion === project.contentVersion;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-moss/40 hover:shadow-md"
    >
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-clay">
          {isUnderstand ? "Comprendre & écouter" : "Projet historique"}
        </p>
        <h2 className="text-lg font-semibold text-ink">{project.title}</h2>
        <p className="text-sm text-ink/60">
          Créé le {new Intl.DateTimeFormat("fr-FR").format(project.createdAt)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-medium text-ink/70">
        <span className="rounded-full bg-mist px-3 py-1">
          {isUnderstand
            ? responseLabels[project.responseMode ?? ""] ?? "Explication"
            : deliveryLabels[project.deliveryType] ?? "Projet audio"}
        </span>
        <span className="rounded-full bg-mist px-3 py-1">{project.audience}</span>
        {hasSynchronizedAudio ? (
          <span className="rounded-full bg-moss/10 px-3 py-1 text-moss">Audio prêt</span>
        ) : null}
      </div>
    </Link>
  );
}
