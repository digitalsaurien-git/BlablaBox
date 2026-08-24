import Link from "next/link";
import { Plus } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getProjects() {
  try {
    return {
      projects: await prisma.project.findMany({ orderBy: { createdAt: "desc" } }),
      error: null,
    };
  } catch (error) {
    return {
      projects: [],
      error: error instanceof Error ? error.message : "Connexion base impossible",
    };
  }
}

export default async function ProjectsPage() {
  const { projects, error } = await getProjects();
  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-clay">Ma bibliothèque</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Mes contenus</h1>
          <p className="mt-2 text-sm text-ink/60">
            Cette bibliothèque reste globale tant que l&apos;authentification n&apos;est pas activée.
          </p>
        </div>
        <Link
          href="/understand/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 font-semibold text-paper transition hover:bg-moss"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nouvelle demande
        </Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Base de données indisponible : {error}
        </p>
      ) : null}

      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink/20 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-ink">Aucun contenu pour le moment</h2>
          <p className="mt-2 text-ink/65">Pose une première question pour commencer.</p>
        </div>
      )}
    </div>
  );
}
