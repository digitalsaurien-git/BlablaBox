import { createChapter, createCoursePart, createCourseTheme, createSchoolYear, createSubject, confirmDuplicatePlacement, moveCoursePart, sortCourseThemeParts, updateChapter, updateCoursePart, updateCourseTheme, updateSchoolYear, updateSubject } from "@/app/courses/actions";
import { requireCurrentUser } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CoursesPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const years = await prisma.schoolYear.findMany({
    where: { userId: user.id },
    orderBy: [{ startYear: "desc" }, { label: "asc" }],
    include: { subjects: { orderBy: { title: "asc" }, include: { themes: { orderBy: { title: "asc" }, include: { chapters: { orderBy: { title: "asc" } }, parts: { orderBy: { position: "asc" }, include: { placements: { include: { sourceAsset: { select: { id: true, imports: { orderBy: { createdAt: "asc" }, take: 1, select: { originalFileName: true } } } } } } } } } } } } },
  });
  const duplicateId = firstParam(params.duplicate);
  const duplicatePartId = firstParam(params.part);
  const duplicate = duplicateId ? await prisma.sourceAsset.findFirst({ where: { id: duplicateId, userId: user.id }, select: { id: true, imports: { orderBy: { createdAt: "desc" }, take: 1, select: { originalFileName: true } } } }) : null;
  const error = firstParam(params.error);
  const allParts = years.flatMap((year) => year.subjects.flatMap((subject) => subject.themes.flatMap((theme) => theme.parts.map((part) => ({ id: part.id, label: `${year.label} · ${subject.title} · ${theme.title} · ${part.referenceLabel ?? part.title}` })))));
  if ((duplicateId && !duplicate) || (duplicatePartId && !allParts.some((part) => part.id === duplicatePartId))) notFound();
  const unplacedSources = await prisma.sourceAsset.findMany({ where: { userId: user.id, placements: { none: {} } }, select: { id: true, imports: { orderBy: { createdAt: "desc" }, take: 1, select: { originalFileName: true } } }, orderBy: { createdAt: "desc" } });

  return (
    <div className="grid min-w-0 gap-6 break-words pb-10">
      <header className="grid min-w-0 gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">Mes cours</p>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Range tes cours simplement</h1>
        <p className="max-w-2xl leading-7 text-ink/70">Garde tes documents originaux et organise-les par année, matière, thème et partie.</p>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage(error)}</p> : null}
      {params.uploaded ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Document conservé dans ta bibliothèque.</p> : null}
      {duplicate ? (
        <section className="grid min-w-0 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Ce document existe déjà</h2>
          {duplicatePartId ? <><p>Une seule copie est conservée. Tu peux confirmer son rattachement à la partie choisie.</p><form action={confirmDuplicatePlacement}><input type="hidden" name="sourceAssetId" value={duplicate.id} /><input type="hidden" name="coursePartId" value={duplicatePartId} /><button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">Rattacher le document</button></form></> : <p>Une seule copie est conservée. Choisis une partie pour la rattacher lorsque tu es prêt.</p>}
        </section>
      ) : null}

      <section className="grid min-w-0 gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold text-ink">Ajouter un document</h2>
        <p className="text-sm leading-6 text-ink/65">PDF ou ODT uniquement. Le fichier original est conservé ; son contenu n’est pas analysé.</p>
        <form action="/api/sources" method="post" encType="multipart/form-data" className="grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium text-ink"><span>Fichier</span><input name="file" type="file" accept=".pdf,.odt,application/pdf,application/vnd.oasis.opendocument.text" required className="min-w-0 max-w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-medium text-ink"><span>Partie (facultatif)</span><select name="coursePartId" className="min-w-0 max-w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"><option value="">À classer plus tard</option>{allParts.map((part) => <option key={part.id} value={part.id}>{part.label}</option>)}</select></label>
          <button className="rounded-lg bg-clay px-4 py-3 font-semibold text-white">Conserver le document</button>
        </form>
      </section>

      <section className="grid min-w-0 gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-semibold text-ink">Nouvelle année scolaire</h2>
        <form action={createSchoolYear} className="grid min-w-0 gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
          <Field name="label" label="Nom" placeholder="2026-2027" required />
          <Field name="startYear" label="Début" placeholder="2026" />
          <Field name="endYear" label="Fin" placeholder="2027" />
          <button className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper">Ajouter</button>
        </form>
      </section>

      {unplacedSources.length ? <section className="grid min-w-0 gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5"><div><h2 className="text-xl font-semibold text-ink">Documents à classer</h2><p className="text-sm text-ink/65">Choisis une partie quand tu sais où ranger chaque document.</p></div>{unplacedSources.map((source) => <form key={source.id} action={confirmDuplicatePlacement} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><input type="hidden" name="sourceAssetId" value={source.id} /><p className="min-w-0 break-words rounded-lg bg-white px-3 py-2 text-sm text-ink"><a className="underline" href={`/api/sources/${source.id}/download`}>{source.imports[0]?.originalFileName ?? "Document source"}</a></p><select aria-label="Partie où classer ce document" name="coursePartId" required className="min-w-0 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"><option value="">Choisir une partie</option>{allParts.map((part) => <option key={part.id} value={part.id}>{part.label}</option>)}</select><button className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">Rattacher</button></form>)}</section> : null}

      {years.length === 0 ? <p className="rounded-2xl border border-dashed border-ink/20 bg-white p-8 text-center text-ink/65">Commence par ajouter une année scolaire.</p> : null}
      {years.map((year) => (
        <section key={year.id} className="grid min-w-0 gap-5 rounded-2xl border border-ink/10 bg-paper/60 p-4 shadow-sm sm:p-5">
          <div><h2 className="text-2xl font-bold text-ink">{year.label}</h2><p className="text-sm text-ink/60">Une année contient tes matières.</p><form action={updateSchoolYear} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="schoolYearId" value={year.id} /><input name="label" defaultValue={year.label} aria-label="Modifier l'année" className="min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-sm" /><button className="rounded-lg border border-ink/15 px-3 py-2 text-sm">Modifier</button></form></div>
          <form action={createSubject} className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="schoolYearId" value={year.id} /><Field name="title" label="Ajouter une matière" placeholder="Histoire" required /><button className="rounded-lg bg-moss px-4 py-3 font-semibold text-white">Ajouter</button></form>
          {year.subjects.map((subject) => (
            <div key={subject.id} className="grid min-w-0 gap-4 rounded-xl border border-ink/10 bg-white p-4">
              <div><h3 className="text-xl font-semibold text-ink">{subject.title}</h3><form action={updateSubject} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="subjectId" value={subject.id} /><input name="title" defaultValue={subject.title} aria-label="Modifier la matière" className="min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-sm" /><button className="rounded-lg border border-ink/15 px-3 py-2 text-sm">Modifier</button></form></div>
              <form action={createCourseTheme} className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="subjectId" value={subject.id} /><Field name="title" label="Ajouter un thème" placeholder="Les débuts de l&apos;humanité" required /><button className="rounded-lg border border-moss px-4 py-3 font-semibold text-moss">Ajouter</button></form>
              {subject.themes.map((theme) => (
                <div key={theme.id} className="grid min-w-0 gap-4 rounded-xl border border-ink/10 bg-paper p-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h4 className="text-lg font-semibold text-ink">{theme.title}</h4><p className="text-xs text-ink/55">L&apos;ordre des parties est confirmé séparément.</p><form action={updateCourseTheme} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="courseThemeId" value={theme.id} /><input name="title" defaultValue={theme.title} aria-label="Modifier le thème" className="min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-sm" /><button className="rounded-lg border border-ink/15 px-3 py-2 text-sm">Modifier</button></form></div><form action={sortCourseThemeParts}><input type="hidden" name="courseThemeId" value={theme.id} /><input type="hidden" name="orderVersion" value={theme.orderVersion} /><button className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-ink">Trier les repères</button></form></div>
                  <form action={createChapter} className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="courseThemeId" value={theme.id} /><Field name="title" label="Ajouter un chapitre (facultatif)" placeholder="Chapitre 1" required /><button className="rounded-lg border border-ink/15 px-4 py-3 font-semibold text-ink">Ajouter</button></form>{theme.chapters.length ? <div className="grid min-w-0 gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Chapitres</p>{theme.chapters.map((chapter) => <form key={chapter.id} action={updateChapter} className="flex flex-wrap gap-2"><input type="hidden" name="chapterId" value={chapter.id} /><input name="title" defaultValue={chapter.title} aria-label="Modifier le chapitre" className="min-w-0 flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm" /><button className="rounded-lg border border-ink/15 px-3 py-2 text-sm">Modifier</button></form>)}</div> : null}
                  <form action={createCoursePart} className="grid min-w-0 gap-3 rounded-lg border border-ink/10 bg-white p-3 sm:grid-cols-2"><input type="hidden" name="courseThemeId" value={theme.id} /><input type="hidden" name="orderVersion" value={theme.orderVersion} /><Field name="title" label="Titre de la partie" placeholder="Cours sur les premiers humains" /><Field name="referenceLabel" label="Repère (ex. 4.2)" placeholder="4.2" /><label className="flex items-center gap-2 text-sm text-ink/75 sm:col-span-2"><input type="checkbox" name="documentExpected" /> Document encore attendu</label><label className="sm:col-span-2"><span className="sr-only">Chapitre</span><select name="chapterId" className="w-full rounded-lg border border-ink/15 px-3 py-2"><option value="">Sans chapitre pour le moment</option>{theme.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><button className="rounded-lg bg-clay px-4 py-3 font-semibold text-white sm:col-span-2">Ajouter la partie</button></form>
                  {theme.parts.length === 0 ? <p className="text-sm text-ink/60">Aucune partie. Tu peux en ajouter une ou créer un emplacement pour un document attendu.</p> : <ol className="grid min-w-0 gap-3">{theme.parts.map((part, index) => <li key={part.id} className="rounded-xl border border-ink/10 bg-white p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-clay">{part.referenceLabel ?? "Sans repère"} · {part.state === "DOCUMENT_EXPECTED" ? "Document attendu" : part.placements.length ? "Document enregistré" : "Partie sans document"}</p><p className="mt-1 font-semibold text-ink">{part.title}</p>{part.placements.length ? <ul className="mt-2 grid gap-1 text-sm text-ink/65">{part.placements.map((placement) => <li key={placement.id}><a className="underline hover:text-moss" href={`/api/sources/${placement.sourceAsset.id}/download`}>{placement.sourceAsset.imports[0]?.originalFileName ?? "Document source"}</a></li>)}</ul> : <p className="mt-2 text-sm text-ink/55">Aucun document rattaché.</p>}</div><div className="flex shrink-0 gap-2"><form action={moveCoursePart}><input type="hidden" name="partId" value={part.id} /><input type="hidden" name="orderVersion" value={theme.orderVersion} /><input type="hidden" name="direction" value="up" /><button disabled={index === 0} className="rounded-lg border border-ink/15 px-3 py-2 text-sm disabled:opacity-35" aria-label="Monter">↑</button></form><form action={moveCoursePart}><input type="hidden" name="partId" value={part.id} /><input type="hidden" name="orderVersion" value={theme.orderVersion} /><input type="hidden" name="direction" value="down" /><button disabled={index === theme.parts.length - 1} className="rounded-lg border border-ink/15 px-3 py-2 text-sm disabled:opacity-35" aria-label="Descendre">↓</button></form></div></div><form action={updateCoursePart} className="mt-3 grid gap-2 border-t border-ink/10 pt-3 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end"><input type="hidden" name="partId" value={part.id} /><input type="hidden" name="orderVersion" value={theme.orderVersion} /><label className="grid min-w-0 gap-1 text-sm"><span>Chapitre</span><select name="chapterId" defaultValue={part.chapterId ?? ""} className="min-w-0 rounded-lg border border-ink/15 px-3 py-2"><option value="">Sans chapitre</option>{theme.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><Field name="title" label="Modifier le titre" defaultValue={part.title} required /><Field name="referenceLabel" label="Modifier le repère" defaultValue={part.referenceLabel ?? ""} /><button className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-ink">Enregistrer</button></form><form action="/api/sources" method="post" encType="multipart/form-data" className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3 sm:flex-row sm:items-end"><input type="hidden" name="coursePartId" value={part.id} /><label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-ink/70"><span>Ajouter le document de cette partie</span><input name="file" type="file" accept=".pdf,.odt,application/pdf,application/vnd.oasis.opendocument.text" required className="min-w-0 max-w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm" /></label><button className="rounded-lg border border-moss px-3 py-2 text-sm font-semibold text-moss">Importer ici</button></form></li>)}</ol>}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Field({ name, label, placeholder, defaultValue, required }: { name: string; label: string; placeholder?: string; defaultValue?: string; required?: boolean }) {
  return <label className="grid min-w-0 gap-1 text-sm font-medium text-ink"><span>{label}</span><input name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} className="min-w-0 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 outline-none focus:border-moss focus:ring-2 focus:ring-moss/15" /></label>;
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    "stale-order": "Les parties ont été modifiées dans un autre onglet. La liste est actualisée : vérifie-la puis recommence ton action.",
    "already-exists": "Ce nom existe déjà à cet emplacement. Choisis un autre nom.",
    "invalid-fields": "Un champ est trop long ou invalide. Raccourcis-le puis réessaie.",
    "file-too-large": "Le fichier dépasse la taille autorisée.",
    "format-or-size": "Document refusé : choisis un PDF ou ODT valide, dans la limite de taille autorisée.",
    "file-required": "Choisis un fichier PDF ou ODT.",
    "upload-failed": "Le document n’a pas pu être enregistré. Réessaie après avoir vérifié le fichier.",
  };
  return messages[code] ?? "L’action n’a pas pu aboutir. Vérifie les champs puis réessaie.";
}
