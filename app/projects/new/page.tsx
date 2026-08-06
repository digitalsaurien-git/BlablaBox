import { ProjectForm } from "@/components/project-form";

type NewProjectPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-clay">
          Creation
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">Nouveau projet audio</h1>
        <p className="mt-3 text-ink/70">
          Transforme un texte ou un sujet en script pédagogique, puis génère son audio MP3 depuis la page du projet.
        </p>
      </div>

      <ProjectForm hasError={params.error === "missing-fields"} />
    </div>
  );
}
