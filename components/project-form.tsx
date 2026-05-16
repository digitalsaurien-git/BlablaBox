import { createProject } from "@/app/projects/actions";

const durations = [3, 5, 10, 15, 20];
const deliveryTypes = [
  { value: "IMMERSIVE_STORY", label: "Histoire immersive" },
  { value: "COURSE_SUMMARY", label: "Résumé de cours" },
  { value: "MEMORY_AUDIO_CARD", label: "Fiche audio de mémorisation" },
  { value: "REVIEW_QA", label: "Questions-réponses de révision" },
];

export function ProjectForm({ hasError }: { hasError: boolean }) {
  return (
    <form action={createProject} className="grid gap-5">
      {hasError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Le texte source et l'objectif pedagogique sont obligatoires.
        </p>
      ) : null}

      <label className="grid gap-2">
        <span className="text-sm font-medium text-ink">Texte ou sujet libre</span>
        <textarea
          name="sourceContent"
          required
          rows={9}
          className="min-h-48 rounded-md border border-ink/15 bg-white px-4 py-3 text-base outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          placeholder="Colle un texte, une notion de cours ou decris le sujet a transformer en script audio."
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Duree cible</span>
          <select
            name="targetDurationMinutes"
            defaultValue="3"
            className="rounded-md border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          >
            {durations.map((duration) => (
              <option key={duration} value={duration}>
                {duration} minutes
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Type de restitution</span>
          <select
            name="deliveryType"
            defaultValue="COURSE_SUMMARY"
            className="rounded-md border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          >
            {deliveryTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Public cible</span>
          <input
            name="audience"
            defaultValue="Apprenants curieux"
            className="rounded-md border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Ton narratif</span>
          <select
            name="tone"
            defaultValue="Clair et vivant"
            className="rounded-md border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          >
            <option>Clair et vivant</option>
            <option>Calme et rassurant</option>
            <option>Dynamique</option>
            <option>Storytelling</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Niveau</span>
          <select
            name="level"
            defaultValue="Intermediaire"
            className="rounded-md border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          >
            <option>Debutant</option>
            <option>Intermediaire</option>
            <option>Avance</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-ink">Objectif pedagogique</span>
        <input
          name="learningObjective"
          required
          className="rounded-md border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          placeholder="Exemple : comprendre les bases de la photosynthese et s'en souvenir."
        />
      </label>

      <button className="rounded-md bg-clay px-5 py-3 text-base font-semibold text-white transition hover:bg-clay/90">
        Generer le script
      </button>
    </form>
  );
}