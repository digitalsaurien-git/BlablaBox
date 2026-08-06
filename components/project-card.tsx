import Link from "next/link";

const deliveryTypeLabels: Record<string, string> = {
  IMMERSIVE_STORY: "Histoire immersive",
  COURSE_SUMMARY: "Résumé de cours",
  MEMORY_AUDIO_CARD: "Fiche audio de mémorisation",
  REVIEW_QA: "Questions-réponses de révision",
};

type ProjectCardProps = {
  project: {
    id: string;
    title: string;
    targetDurationMinutes: number;
    audience: string;
    deliveryType: string;
    scriptStatus: string;
    audioStatus: string;
    createdAt: Date;
  };
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="grid gap-4 rounded-md border border-ink/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-moss/40 hover:shadow-md"
    >
      <div className="grid gap-2">
        <h2 className="text-lg font-semibold text-ink">{project.title}</h2>
        <p className="text-sm text-ink/60">
          Cree le {new Intl.DateTimeFormat("fr-FR").format(project.createdAt)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-medium text-ink/70">
        <span className="inline-flex items-center gap-1 rounded bg-mist px-2 py-1">
          <span aria-hidden="true">~</span>
          {project.targetDurationMinutes} min
        </span>
        <span className="rounded bg-mist px-2 py-1">
          {deliveryTypeLabels[project.deliveryType] ?? "Résumé de cours"}
        </span>
        <span className="rounded bg-mist px-2 py-1">{project.audience}</span>
        <span className="inline-flex items-center gap-1 rounded bg-mist px-2 py-1">
          <span aria-hidden="true">doc</span>
          {project.scriptStatus}
        </span>
        <span className="rounded bg-paper px-2 py-1">{project.audioStatus}</span>
      </div>
    </Link>
  );
}
