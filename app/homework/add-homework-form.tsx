"use client";

import { useState } from "react";

type Props = {
  createAction: (formData: FormData) => Promise<void>;
};

export function AddHomeworkForm({ createAction }: Props) {
  const [open, setOpen] = useState(false);

  // Format today as yyyy-mm-dd for the date input default
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-ink/5"
      >
        <span aria-hidden>+</span> Ajouter un devoir
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await createAction(formData);
        setOpen(false);
      }}
      className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"
    >
      <h2 className="font-semibold text-ink">Nouveau devoir</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-ink/80">Matière</span>
          <input
            name="subjectLabel"
            required
            placeholder="ex: Français, Maths…"
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-ink/80">Date de rendu</span>
          <input
            type="date"
            name="dueDate"
            required
            defaultValue={today}
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-ink/80">Description du devoir</span>
        <textarea
          name="description"
          required
          rows={3}
          placeholder="ex: Faire les exercices 1 à 5 p.42, apprendre la leçon sur les fractions…"
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-ink"
        />
      </label>

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/85"
        >
          Ajouter
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
