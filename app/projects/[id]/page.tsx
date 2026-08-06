import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ProjectMetaPanel } from "@/components/project-meta-panel";
import { RegenerateScriptButton } from "@/components/regenerate-script-button";
import { ScriptView } from "@/components/script-view";
import { GenerateAudioButton } from "@/components/generate-audio-button";
import { deleteProject, generateProjectAudio, regenerateProjectScript } from "@/app/projects/actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ProjectDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: {
      id,
    },
  });

  if (!project) {
    notFound();
  }

  const hasError = project.scriptStatus === "SCRIPT_FAILED" || Boolean(project.errorMessage);
  const hasAudio = Boolean(project.audioFilePath);

  return (
    <div className="grid gap-6 pb-8">
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink/70 transition hover:text-ink"
      >
        <span aria-hidden="true">Retour</span>
        Retour à la bibliothèque
      </Link>

      <section className="grid gap-4 rounded-md border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-clay">
              Projet audio
            </p>
            <h1 className="mt-2 break-words text-2xl font-bold text-ink sm:text-3xl">
              {project.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/70">
              Écran de contrôle du projet : paramètres, source, script, statuts et actions de test.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <form action={regenerateProjectScript}>
              <input type="hidden" name="projectId" value={project.id} />
              <RegenerateScriptButton />
            </form>
            <form action={deleteProject}>
              <input type="hidden" name="projectId" value={project.id} />
              <DeleteProjectButton />
            </form>
          </div>
        </div>
      </section>

      <ProjectMetaPanel project={project} />

      {hasError ? (
        <section className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <h2 className="font-semibold">Erreur de génération</h2>
          <p className="mt-2 leading-6">
            {project.errorMessage ?? "La dernière génération n'a pas abouti. L'ancien script est conservé."}
          </p>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-md border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold text-ink">Objectif pédagogique</h2>
        <p className="leading-7 text-ink/75">{project.learningObjective}</p>
      </section>

      <section className="grid gap-3 rounded-md border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold text-ink">Source utilisée</h2>
        <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-ink/10 bg-paper p-4 text-sm leading-7 text-ink/75 sm:text-base">
          {project.sourceContent}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold text-ink">Script généré</h2>
            <p className="mt-1 text-sm text-ink/60">
              La régénération remplace le script uniquement en cas de succès.
            </p>
          </div>
        </div>
        <ScriptView script={project.script} />
      </section>

      <section className="grid gap-4 rounded-md border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-ink">Audio MP3</h2>
            <p className="mt-1 text-sm text-ink/60">Voix générée par intelligence artificielle.</p>
          </div>
          <form action={generateProjectAudio}>
            <input type="hidden" name="projectId" value={project.id} />
            <GenerateAudioButton disabled={!project.script || project.audioStatus === "PENDING"} />
          </form>
        </div>

        {project.audioStatus === "PENDING" ? (
          <p className="rounded-md bg-mist px-4 py-3 text-sm text-ink/70">Génération audio en cours...</p>
        ) : null}

        {project.audioErrorMessage ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{project.audioErrorMessage}</p>
        ) : null}

        {hasAudio ? (
          <div className="grid gap-3">
            {project.audioStatus !== "GENERATED" ? (
              <p className="text-sm text-amber-800">Le lecteur contient le dernier audio généré avec succès. La tentative la plus récente n'a pas abouti.</p>
            ) : null}
            <audio controls preload="metadata" className="w-full" src={`/api/projects/${project.id}/audio`}>
              Votre navigateur ne prend pas en charge la lecture audio.
            </audio>
            <a href={`/api/projects/${project.id}/audio?download=1`} className="inline-flex w-fit items-center justify-center rounded-md border border-ink/15 bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-moss hover:text-moss">
              Télécharger le MP3
            </a>
          </div>
        ) : null}
      </section>
    </div>
  );
}
