import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ProjectMetaPanel } from "@/components/project-meta-panel";
import { ProjectSources } from "@/components/project-sources";
import { ContinuousAudioPlayer } from "@/components/continuous-audio-player";
import { RegenerateScriptButton } from "@/components/regenerate-script-button";
import { ScriptView } from "@/components/script-view";
import { GenerateAudioButton } from "@/components/generate-audio-button";
import {
  deleteProject,
  generateProjectAudio,
  regenerateProjectScript,
} from "@/app/projects/actions";
import { regenerateUnderstandProject } from "@/app/understand/actions";
import { getStoredAudioPlayback, storedAudioExists } from "@/lib/audio-storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { sources: { orderBy: { sourceOrder: "asc" } } },
  });
  if (!project) notFound();

  const isUnderstand = project.projectKind === "UNDERSTAND_LISTEN";
  const hasError = project.scriptStatus === "SCRIPT_FAILED" || Boolean(project.errorMessage);
  const audioVersionMatches =
    project.audioContentVersion !== null &&
    project.audioContentVersion === project.contentVersion;
  const audioPlayback = audioVersionMatches
    ? await getStoredAudioPlayback(project.audioFilePath).catch(() => null)
    : null;
  const audioFileExists = audioVersionMatches
    ? await storedAudioExists(project.audioFilePath)
    : false;
  const hasCurrentAudio = audioVersionMatches && audioFileExists && Boolean(audioPlayback);
  const hasObsoleteAudio = Boolean(project.audioFilePath) && !audioVersionMatches;
  const audioSources = audioPlayback?.segments.map((_, index) =>
    audioPlayback.segmented
      ? `/api/projects/${project.id}/audio?segment=${index}`
      : `/api/projects/${project.id}/audio`,
  ) ?? [];
  const regenerateAction = isUnderstand
    ? regenerateUnderstandProject
    : regenerateProjectScript;

  return (
    <div className="grid gap-6 pb-8">
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink/70 transition hover:text-ink"
      >
        ← Retour à la bibliothèque
      </Link>

      <section className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-clay">
              {isUnderstand ? "Comprendre & écouter" : "Projet audio historique"}
            </p>
            <h1 className="mt-2 break-words text-2xl font-bold text-ink sm:text-3xl">
              {project.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/70">
              {isUnderstand
                ? "Lis la réponse, consulte les sources éventuelles et écoute exactement cette version du contenu."
                : "Ce projet reste accessible dans son format historique."}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <form action={regenerateAction}>
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
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <h2 className="font-semibold">La dernière génération a échoué</h2>
          <p className="mt-2 leading-6">
            {project.errorMessage ?? "Le contenu, ses sources et son audio synchronisé ont été conservés."}
          </p>
        </section>
      ) : null}

      {!isUnderstand ? (
        <section className="grid gap-3 rounded-xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xl font-semibold text-ink">Objectif pédagogique</h2>
          <p className="leading-7 text-ink/75">{project.learningObjective}</p>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold text-ink">
          {isUnderstand ? "Ta demande" : "Source utilisée"}
        </h2>
        <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-ink/10 bg-paper p-4 text-sm leading-7 text-ink/75 sm:text-base">
          {project.sourceContent}
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            {isUnderstand ? "Réponse" : "Script généré"}
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Version {project.contentVersion}. Une génération échouée ne remplace jamais cette version.
          </p>
        </div>
        <ScriptView script={project.script} />
      </section>

      {isUnderstand && (project.researchUsed || project.sources.length > 0) ? (
        <ProjectSources sources={project.sources} researchUsed={project.researchUsed} />
      ) : null}

      <section className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-ink">Écouter cette réponse</h2>
            <p className="mt-1 text-sm text-ink/60">
              La voix est générée par intelligence artificielle.
            </p>
          </div>
          <form action={generateProjectAudio}>
            <input type="hidden" name="projectId" value={project.id} />
            <GenerateAudioButton
              disabled={!project.script || project.audioStatus === "PENDING"}
            />
          </form>
        </div>

        {project.audioStatus === "PENDING" ? (
          <p className="rounded-xl bg-mist px-4 py-3 text-sm text-ink/70">Génération audio en cours...</p>
        ) : null}

        {project.audioErrorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {project.audioErrorMessage}
          </p>
        ) : null}

        {hasObsoleteAudio ? (
          <p className="rounded-xl bg-mist px-4 py-3 text-sm leading-6 text-ink/70">
            Un ancien MP3 est conservé, mais il n&apos;est pas proposé car il n&apos;est pas certifié pour la version actuelle du texte.
          </p>
        ) : null}

        {audioVersionMatches && !audioFileExists ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            La référence audio existe, mais le fichier est introuvable dans le stockage persistant. Tu peux le générer à nouveau.
          </p>
        ) : null}

        {hasCurrentAudio ? (
          <div className="grid gap-3">
            {project.audioStatus !== "GENERATED" ? (
              <p className="text-sm text-amber-800">
                Le lecteur conserve le dernier audio valide de cette même version du texte.
              </p>
            ) : null}
            <ContinuousAudioPlayer sources={audioSources} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
