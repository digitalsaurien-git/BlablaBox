import { createUnderstandProject } from "@/app/understand/actions";
import { UnderstandSubmitButton } from "./understand-submit-button";

const responseModes = [
  { value: "EXPLAIN", label: "Expliquer", description: "Comprendre clairement un sujet" },
  { value: "STORY", label: "Histoire", description: "Découvrir le sujet par un récit" },
  { value: "REVIEW", label: "Réviser", description: "Retenir les idées importantes" },
  { value: "QUICK", label: "Réponse rapide", description: "Aller directement à l'essentiel" },
];

export function UnderstandForm({ hasError }: { hasError: boolean }) {
  return (
    <form action={createUnderstandProject} className="grid gap-6">
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Écris d&apos;abord ce que tu veux comprendre, apprendre ou écouter.
        </p>
      ) : null}

      <label className="grid gap-2">
        <span className="text-base font-semibold text-ink">
          Que veux-tu comprendre, apprendre ou écouter&nbsp;?
        </span>
        <textarea
          name="userRequest"
          required
          rows={7}
          autoFocus
          className="min-h-44 rounded-2xl border border-ink/15 bg-white px-4 py-4 text-base leading-7 outline-none transition placeholder:text-ink/40 focus:border-moss focus:ring-4 focus:ring-moss/10"
          placeholder="Par exemple : Explique-moi comment fonctionnent les cellules humaines."
        />
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-base font-semibold text-ink">Quel type de réponse souhaites-tu&nbsp;?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {responseModes.map((mode, index) => (
            <label key={mode.value} className="cursor-pointer">
              <input
                type="radio"
                name="responseMode"
                value={mode.value}
                defaultChecked={index === 0}
                className="peer sr-only"
              />
              <span className="grid h-full gap-1 rounded-xl border border-ink/15 bg-white p-4 transition peer-checked:border-moss peer-checked:bg-mist peer-checked:ring-2 peer-checked:ring-moss/15">
                <span className="font-semibold text-ink">{mode.label}</span>
                <span className="text-sm leading-5 text-ink/60">{mode.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="rounded-2xl border border-ink/10 bg-white">
        <summary className="cursor-pointer px-4 py-4 font-semibold text-ink sm:px-5">
          Options pédagogiques
          <span className="ml-2 text-sm font-normal text-ink/55">Collège · Intermédiaire · Courant · Standard</span>
        </summary>
        <div className="grid gap-4 border-t border-ink/10 p-4 sm:grid-cols-2 sm:p-5">
          <Select name="audience" label="Public" defaultValue="Collège" options={["10-12 ans", "Collège", "Lycée", "Adulte"]} />
          <Select name="level" label="Niveau" defaultValue="Intermédiaire" options={["Débutant", "Intermédiaire", "Avancé"]} />
          <Select
            name="vocabularyLevel"
            label="Vocabulaire"
            defaultValue="COMMON"
            options={[
              ["VERY_SIMPLE", "Très simple"],
              ["COMMON", "Courant"],
              ["PRECISE", "Précis"],
            ]}
          />
          <Select
            name="adaptationMode"
            label="Adaptation"
            defaultValue="STANDARD"
            options={[
              ["STANDARD", "Standard"],
              ["FOCUS", "Concentration"],
              ["EASY_READING", "Lecture facilitée"],
              ["MEMORY", "Mémorisation"],
            ]}
          />
        </div>
      </details>

      <div className="flex justify-end">
        <UnderstandSubmitButton />
      </div>
    </form>
  );
}

type SelectProps = {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<string | [string, string]>;
};

function Select({ name, label, defaultValue, options }: SelectProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
      >
        {options.map((option) => {
          const [value, text] = Array.isArray(option) ? option : [option, option];
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}
