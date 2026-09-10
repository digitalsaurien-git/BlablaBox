"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { SmartCourseProposal, SmartSubjectOption } from "@/lib/courses/smart-types";

type SchoolYearOption = { id: string; label: string };

function initialThemeChoice(subject: SmartSubjectOption | undefined): string {
  if (!subject) return "";
  if (subject.themeSuggestion.kind === "existing") return subject.themeSuggestion.themeId ?? "";
  return subject.themeSuggestion.kind === "new" ? "new" : "";
}

function sameReference(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left.replace(/\s+/g, "") === right.replace(/\s+/g, ""));
}

export function SmartCourseImport({ years }: { years: SchoolYearOption[] }) {
  const [proposal, setProposal] = useState<SmartCourseProposal | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [themeChoice, setThemeChoice] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const subject = proposal?.subjects.find((candidate) => candidate.id === subjectId);
  const selectedTheme = subject?.themes.find((theme) => theme.id === themeChoice);
  const matchingPart = useMemo(
    () => selectedTheme?.parts.find((part) => sameReference(part.referenceLabel, proposal?.referenceLabel ?? null)),
    [selectedTheme, proposal],
  );

  function chooseSubject(candidate: SmartSubjectOption) {
    setSubjectId(candidate.id);
    setThemeChoice(initialThemeChoice(candidate));
    if (candidate.themeSuggestion.kind === "existing" && candidate.themeSuggestion.title) setCourseTitle(candidate.themeSuggestion.title);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.dataset.mode === "unplaced" || proposal) return;
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/courses/analyze", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Analyse impossible.");
      const next = result as SmartCourseProposal;
      setProposal(next);
      setCourseTitle(next.courseTitle);
      const suggested = next.subjects.find((candidate) => candidate.id === next.suggestedSubjectId);
      if (suggested) chooseSubject(suggested);
      else { setSubjectId(""); setThemeChoice(""); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analyse impossible.");
    } finally {
      setPending(false);
    }
  }

  function resetProposal() {
    setProposal(null);
    setSubjectId("");
    setThemeChoice("");
    setCourseTitle("");
    setEditing(false);
    setError("");
  }

  if (!years.length) return (
    <section className="grid min-w-0 gap-4 rounded-2xl border border-clay/25 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-2xl font-bold text-ink">Ajouter un cours</h2>
      <p className="text-ink/70">Ajoute d’abord une année scolaire et ses matières dans « Organiser mes cours ».</p>
      <a href="#organiser" className="w-fit rounded-lg bg-ink px-4 py-3 font-semibold text-paper">Organiser mes cours</a>
    </section>
  );

  return (
    <section className="grid min-w-0 gap-5 rounded-2xl border border-clay/25 bg-white p-4 shadow-sm sm:p-6">
      <div className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-clay">Action principale</p>
        <h2 className="text-2xl font-bold text-ink">Ajouter un cours</h2>
        <p className="max-w-2xl text-sm leading-6 text-ink/65">Choisis ton PDF ou ton ODT. BlablaBox propose ensuite son rangement sans l’envoyer à un service extérieur.</p>
      </div>

      <form action="/api/courses/import" method="post" encType="multipart/form-data" onSubmit={submit} className="grid min-w-0 gap-4">
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-ink">
          <span>Ton document</span>
          <input name="file" type="file" accept=".pdf,.odt,application/pdf,application/vnd.oasis.opendocument.text" required onChange={resetProposal} className="min-w-0 max-w-full rounded-xl border border-ink/15 bg-paper px-3 py-3 font-normal" />
        </label>
        <details className="rounded-xl border border-ink/10 bg-paper/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-ink/75">Année scolaire</summary>
          <label className="mt-3 grid gap-1"><span className="text-ink/65">Ranger dans</span><select name="schoolYearId" defaultValue={years[0].id} onChange={resetProposal} className="min-w-0 rounded-lg border border-ink/15 bg-white px-3 py-2">{years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></label>
        </details>

        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

        {!proposal ? (
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <button type="submit" data-mode="analyze" disabled={pending} className="rounded-xl bg-clay px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Analyse en cours…" : "Continuer"}</button>
            <button type="submit" data-mode="unplaced" formAction="/api/sources" formMethod="post" className="rounded-xl border border-ink/15 px-5 py-3 font-semibold text-ink">Ajouter sans ranger maintenant</button>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 rounded-2xl bg-sand/45 p-4 sm:p-5" aria-live="polite">
            <p className="font-semibold text-ink">Nous pensons que ce document appartient à :</p>
            {!proposal.readableText ? <p className="rounded-lg bg-white px-3 py-2 text-sm text-ink/70">Je n’ai pas pu lire le contenu. Vérifie simplement le rangement proposé.</p> : null}

            {!subject ? (
              <fieldset className="grid gap-3">
                <legend className="font-semibold text-ink">Dans quelle matière ranger ce cours ?</legend>
                <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">{proposal.subjects.map((candidate) => <button type="button" key={candidate.id} onClick={() => chooseSubject(candidate)} className="min-h-12 rounded-xl border border-moss/30 bg-white px-4 py-3 text-left font-semibold text-moss">{candidate.title}</button>)}</div>
                <a href="#organiser" className="text-sm font-semibold text-clay underline">Créer une autre matière</a>
              </fieldset>
            ) : (
              <dl className="grid min-w-0 gap-2 text-sm sm:grid-cols-[7rem_1fr]">
                <dt className="font-semibold text-ink/65">Matière</dt><dd className="min-w-0 break-words font-semibold text-ink">{subject.title}</dd>
                <dt className="font-semibold text-ink/65">Cours</dt><dd className="min-w-0 break-words font-semibold text-ink">{courseTitle}</dd>
                <dt className="font-semibold text-ink/65">Partie</dt><dd className="min-w-0 break-words font-semibold text-ink">{proposal.referenceLabel ?? "Sans repère"}</dd>
              </dl>
            )}

            {subject?.themeSuggestion.kind === "uncertain" && !themeChoice ? (
              <fieldset className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <legend className="px-1 font-semibold text-ink">Est-ce un nouveau cours ?</legend>
                <label className="flex items-center gap-2"><input type="radio" name="courseDecision" onChange={() => { setThemeChoice(subject.themeSuggestion.themeId ?? ""); if (subject.themeSuggestion.title) setCourseTitle(subject.themeSuggestion.title); }} /> {subject.themeSuggestion.title}</label>
                <label className="flex items-center gap-2"><input type="radio" name="courseDecision" onChange={() => { setThemeChoice("new"); setCourseTitle(proposal.courseTitle); }} /> Créer un nouveau cours</label>
              </fieldset>
            ) : null}

            {matchingPart ? <p className="rounded-xl border border-moss/20 bg-white px-4 py-3 text-sm text-moss">La partie {matchingPart.referenceLabel} existe déjà. Le document y sera rattaché sans créer de doublon.</p> : null}

            {editing && subject ? (
              <div className="grid min-w-0 gap-3 rounded-xl border border-ink/10 bg-white p-3">
                <label className="grid gap-1 text-sm"><span className="font-medium">Matière</span><select value={subjectId} onChange={(event) => { const next = proposal.subjects.find((candidate) => candidate.id === event.target.value); if (next) chooseSubject(next); }} className="min-w-0 rounded-lg border border-ink/15 px-3 py-2">{proposal.subjects.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span className="font-medium">Titre du cours</span><input value={courseTitle} maxLength={160} onChange={(event) => { setCourseTitle(event.target.value); if (themeChoice !== "new") setThemeChoice("new"); }} className="min-w-0 rounded-lg border border-ink/15 px-3 py-2" /></label>
                <fieldset className="grid gap-2 text-sm"><legend className="font-medium">Rangement</legend>{subject.themes.map((theme) => <label key={theme.id} className="flex items-center gap-2"><input type="radio" checked={themeChoice === theme.id} onChange={() => { setThemeChoice(theme.id); setCourseTitle(theme.title); }} /> {theme.title}</label>)}<label className="flex items-center gap-2"><input type="radio" checked={themeChoice === "new"} onChange={() => { setThemeChoice("new"); setCourseTitle(proposal.courseTitle); }} /> Créer un nouveau cours</label></fieldset>
              </div>
            ) : null}

            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="courseTitle" value={courseTitle} />
            <input type="hidden" name="themeChoice" value={themeChoice} />
            <input type="hidden" name="orderVersion" value={selectedTheme?.orderVersion ?? ""} />
            <input type="hidden" name="referenceLabel" value={proposal.referenceLabel ?? ""} />
            <input type="hidden" name="partTitle" value={proposal.referenceLabel ? "Partie " + proposal.referenceLabel : courseTitle} />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <button type="submit" data-mode="confirm" disabled={!subject || !themeChoice || !courseTitle.trim()} className="rounded-xl bg-clay px-5 py-3 font-semibold text-white disabled:opacity-40">Ajouter ce cours</button>
              <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-xl px-4 py-3 text-left font-semibold text-moss underline">Modifier</button>
              <button type="button" onClick={resetProposal} className="rounded-xl px-4 py-3 text-left text-sm text-ink/60">Choisir un autre document</button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
