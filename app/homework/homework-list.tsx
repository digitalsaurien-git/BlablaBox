"use client";

import { useState } from "react";
import Link from "next/link";

type HomeworkItem = {
  id: string;
  dueDate: string;
  subjectLabel: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  courseUnresolved: boolean;
  courseTheme: { id: string; title: string; subjectTitle: string } | null;
};

type Theme = { id: string; title: string; subjectTitle: string };

type Props = {
  homeworks: HomeworkItem[];
  allThemes: Theme[];
  today: string;
  updateStatusAction: (id: string, status: "TODO" | "IN_PROGRESS" | "DONE") => Promise<void>;
  linkToCourseAction: (id: string, courseThemeId: string) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
};

const STATUS_LABELS: Record<string, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-amber-50 text-amber-800 border-amber-200",
  IN_PROGRESS: "bg-blue-50 text-blue-800 border-blue-200",
  DONE: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function formatDueDate(isoDueDate: string, todayIso: string): { label: string; urgent: boolean } {
  const due = new Date(isoDueDate);
  const today = new Date(todayIso);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: "En retard", urgent: true };
  if (diffDays === 0) return { label: "Aujourd'hui", urgent: true };
  if (diffDays === 1) return { label: "Demain", urgent: true };
  if (diffDays <= 3) return { label: `Dans ${diffDays} jours`, urgent: true };

  const formatted = due.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return { label: formatted, urgent: false };
}

function HomeworkCard({
  hw,
  allThemes,
  today,
  updateStatusAction,
  linkToCourseAction,
  deleteAction,
}: {
  hw: HomeworkItem;
  allThemes: Theme[];
  today: string;
  updateStatusAction: Props["updateStatusAction"];
  linkToCourseAction: Props["linkToCourseAction"];
  deleteAction: Props["deleteAction"];
}) {
  const [linking, setLinking] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("");

  const { label: dateLabel, urgent } = formatDueDate(hw.dueDate, today);
  const isDone = hw.status === "DONE";

  return (
    <article
      className={`grid gap-3 rounded-2xl border p-4 shadow-sm transition-opacity ${
        isDone ? "opacity-60 border-ink/10 bg-ink/5" : "border-ink/10 bg-white"
      }`}
    >
      {/* Header */}
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        {/* Subject badge */}
        <span className="shrink-0 rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-semibold text-clay">
          {hw.subjectLabel}
        </span>

        {/* Status badge */}
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[hw.status]}`}
        >
          {STATUS_LABELS[hw.status]}
        </span>

        {/* Course unresolved warning */}
        {hw.courseUnresolved && !hw.courseTheme && (
          <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
            ⚠ Cours non référencé
          </span>
        )}

        {/* Due date */}
        <span
          className={`ml-auto shrink-0 text-xs font-medium ${
            urgent ? "text-red-600" : "text-ink/50"
          }`}
        >
          {dateLabel}
        </span>
      </div>

      {/* Description */}
      <p className={`text-sm leading-relaxed ${isDone ? "line-through text-ink/50" : "text-ink/80"}`}>
        {hw.description}
      </p>

      {/* Linked course */}
      {hw.courseTheme && (
        <div className="flex items-center gap-1.5 text-xs text-ink/60">
          <span>📚</span>
          <Link
            href={`/courses`}
            className="underline underline-offset-2 hover:text-ink"
          >
            {hw.courseTheme.subjectTitle} · {hw.courseTheme.title}
          </Link>
        </div>
      )}

      {/* Link to course UI */}
      {(hw.courseUnresolved || (!hw.courseTheme && !hw.courseUnresolved)) && !linking && (
        <button
          onClick={() => setLinking(true)}
          className="self-start text-xs text-ink/50 underline underline-offset-2 hover:text-ink"
        >
          Rattacher à un cours
        </button>
      )}

      {linking && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value)}
            className="flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-xs text-ink"
          >
            <option value="">— Choisir un cours —</option>
            {allThemes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.subjectTitle} · {t.title}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!selectedTheme) return;
              await linkToCourseAction(hw.id, selectedTheme);
              setLinking(false);
            }}
            disabled={!selectedTheme}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Rattacher
          </button>
          <button
            onClick={() => setLinking(false)}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-ink"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-ink/8 pt-3">
        {hw.status !== "TODO" && (
          <button
            onClick={() => updateStatusAction(hw.id, "TODO")}
            className="rounded-lg border border-ink/10 px-3 py-1 text-xs text-ink/60 hover:bg-ink/5"
          >
            À faire
          </button>
        )}
        {hw.status !== "IN_PROGRESS" && (
          <button
            onClick={() => updateStatusAction(hw.id, "IN_PROGRESS")}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
          >
            En cours
          </button>
        )}
        {hw.status !== "DONE" && (
          <button
            onClick={() => updateStatusAction(hw.id, "DONE")}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
          >
            Terminé ✓
          </button>
        )}
        <button
          onClick={() => deleteAction(hw.id)}
          className="ml-auto rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100"
        >
          Supprimer
        </button>
      </div>
    </article>
  );
}

export function HomeworkList({
  homeworks,
  allThemes,
  today,
  updateStatusAction,
  linkToCourseAction,
  deleteAction,
}: Props) {
  const active = homeworks.filter((hw) => hw.status !== "DONE");
  const done = homeworks.filter((hw) => hw.status === "DONE");

  if (homeworks.length === 0) {
    return (
      <p className="rounded-2xl border border-ink/8 bg-ink/3 px-5 py-8 text-center text-sm text-ink/50">
        Aucun devoir pour l'instant.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      {active.length > 0 && (
        <section className="grid gap-3" aria-label="Devoirs à faire">
          <h2 className="text-lg font-bold text-ink">
            À faire{" "}
            <span className="text-sm font-normal text-ink/50">
              ({active.length})
            </span>
          </h2>
          {active.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              allThemes={allThemes}
              today={today}
              updateStatusAction={updateStatusAction}
              linkToCourseAction={linkToCourseAction}
              deleteAction={deleteAction}
            />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="grid gap-3" aria-label="Devoirs terminés">
          <h2 className="text-lg font-bold text-ink/50">
            Terminés{" "}
            <span className="text-sm font-normal">({done.length})</span>
          </h2>
          {done.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              allThemes={allThemes}
              today={today}
              updateStatusAction={updateStatusAction}
              linkToCourseAction={linkToCourseAction}
              deleteAction={deleteAction}
            />
          ))}
        </section>
      )}
    </div>
  );
}
