import { notFound } from "next/navigation";
import Link from "next/link";
import { SmartCourseImport } from "@/components/smart-course-import";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createChapter, createCoursePart, createCourseTheme, createSchoolYear, createSubject,
  confirmDuplicatePlacement, moveCoursePart, sortCourseThemeParts,
  updateChapter, updateCoursePart, updateCourseTheme, updateSchoolYear, updateSubject,
} from "./actions";

export const dynamic = "force-dynamic";
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

function Field({ name, label, value, required = false }: { name: string; label: string; value?: string; required?: boolean }) {
  return <label className="grid min-w-0 gap-1 text-sm"><span className="font-medium">{label}</span><input name={name} defaultValue={value} required={required} className="min-w-0 rounded-lg border border-ink/15 bg-white px-3 py-2" /></label>;
}

export default async function CoursesPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const years = await prisma.schoolYear.findMany({
    where: { userId: user.id },
    orderBy: [{ startYear: "desc" }, { label: "asc" }],
    include: { subjects: { orderBy: { title: "asc" }, include: { themes: { where: { deletedAt: null }, orderBy: { title: "asc" }, include: {
      chapters: { orderBy: { title: "asc" } },
      parts: { orderBy: [{ position: "asc" }, { id: "asc" }], include: { placements: { include: { sourceAsset: { select: { id: true, imports: { orderBy: { createdAt: "asc" }, take: 1, select: { originalFileName: true } } } } } } } },
    } } } } },
  });
  const allParts = years.flatMap((year) => year.subjects.flatMap((subject) => subject.themes.flatMap((course) => course.parts.map((part) => ({
    id: part.id,
    label: [year.label, subject.title, course.title, part.referenceLabel ?? part.title].join(" · "),
  })))));
  const duplicateId = first(params.duplicate);
  const duplicatePartId = first(params.part);
  const duplicate = duplicateId && !["0", "1"].includes(duplicateId)
    ? await prisma.sourceAsset.findFirst({ where: { id: duplicateId, userId: user.id }, select: { id: true } })
    : null;
  if ((duplicateId && !["0", "1"].includes(duplicateId) && !duplicate) || (duplicatePartId && !allParts.some((part) => part.id === duplicatePartId))) notFound();
  const unplaced = await prisma.sourceAsset.findMany({
    where: { userId: user.id, placements: { none: {} } },
    select: { id: true, imports: { orderBy: { createdAt: "desc" }, take: 1, select: { originalFileName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return <div className="grid min-w-0 gap-7 break-words pb-10">
    <header className="grid gap-3">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">Mes cours</p>
      <h1 className="text-3xl font-bold text-ink sm:text-4xl">Tes cours, rassemblés simplement</h1>
      <p className="max-w-2xl leading-7 text-ink/70">Ajoute un document : BlablaBox propose où le ranger et rassemble les différentes parties dans un seul cours.</p>
    </header>
    {first(params.error) ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage(first(params.error) ?? "")}</p> : null}
    {params.added ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{first(params.duplicate) === "1" ? "Ce document existait déjà : une seule copie est conservée et son rangement est enregistré." : first(params.reused) === "1" ? "Document ajouté à la partie existante." : "Cours ajouté à ta bibliothèque."}</p> : null}
    {params.uploaded ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Document ajouté dans « Documents à classer ».</p> : null}

    <SmartCourseImport years={years.map((year) => ({ id: year.id, label: year.label }))} />

    <section className="grid min-w-0 gap-4" aria-labelledby="course-list-title">
      <div><h2 id="course-list-title" className="text-2xl font-bold text-ink">Mes cours</h2><p className="text-sm text-ink/65">Chaque fiche rassemble les documents d’un même cours.</p></div>
      {years.map((year) => year.subjects.map((subject) => <div key={subject.id} className="grid min-w-0 gap-3">
        <h3 className="text-lg font-bold text-moss">{subject.title}<span className="ml-2 text-sm font-normal text-ink/50">{year.label}</span></h3>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">{subject.themes.map((course) => {
          const count = course.parts.reduce((total, part) => total + part.placements.length, 0);
          return <article key={course.id} className="min-w-0 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
            <h4 className="break-words text-lg font-semibold text-ink">{course.title}</h4><p className="text-sm text-ink/60">{count} document{count === 1 ? "" : "s"}</p>
            <Link href={`/courses/${course.id}`} className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-moss px-5 py-3 font-semibold text-white">Ouvrir ce cours</Link>
            <details className="mt-4"><summary className="cursor-pointer text-sm">Documents du cours</summary>
            <ol className="mt-4 grid min-w-0 gap-3 border-t border-ink/10 pt-4">{course.parts.map((part) => <li key={part.id} className="min-w-0 rounded-xl bg-paper p-3">
              <p className="font-semibold">{part.referenceLabel ? part.referenceLabel + " — " : ""}{part.title}</p>
              {part.placements.length ? <ul className="mt-2 grid gap-1 text-sm">{part.placements.map((placement) => <li key={placement.id}><a className="break-all text-moss underline" href={"/api/sources/" + placement.sourceAsset.id + "/download"}>{placement.sourceAsset.imports[0]?.originalFileName ?? "Document source"}</a></li>)}</ul> : <p className="mt-1 text-sm text-ink/55">{part.state === "DOCUMENT_EXPECTED" ? "Document encore attendu" : "Aucun document rattaché"}</p>}
            </li>)}</ol>
          </details></article>;
        })}</div>
      </div>))}
      {years.every((year) => year.subjects.every((subject) => !subject.themes.length)) ? <p className="rounded-2xl border border-dashed border-ink/20 bg-white p-8 text-center text-ink/65">Ton premier cours apparaîtra ici après son ajout.</p> : null}
    </section>

    {duplicate ? <section className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold">Ce document existe déjà</h2>{duplicatePartId ? <form action={confirmDuplicatePlacement}><input type="hidden" name="sourceAssetId" value={duplicate.id} /><input type="hidden" name="coursePartId" value={duplicatePartId} /><button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">Rattacher le document</button></form> : <p className="text-sm">Une seule copie est conservée. Tu peux la ranger ci-dessous.</p>}</section> : null}
    {unplaced.length ? <section className="grid min-w-0 gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="text-xl font-semibold">Documents à classer</h2>{unplaced.map((source) => <form key={source.id} action={confirmDuplicatePlacement} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_1fr_auto]"><a className="min-w-0 break-all rounded-lg bg-white px-3 py-2 text-sm underline" href={"/api/sources/" + source.id + "/download"}>{source.imports[0]?.originalFileName ?? "Document source"}</a><select name="coursePartId" required aria-label="Partie où ranger ce document" className="min-w-0 rounded-lg border px-3 py-2"><option value="">Choisir une partie</option>{allParts.map((part) => <option key={part.id} value={part.id}>{part.label}</option>)}</select><input type="hidden" name="sourceAssetId" value={source.id} /><button className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">Rattacher</button></form>)}</section> : null}

    <details id="organiser" className="min-w-0 rounded-2xl border border-ink/10 bg-paper/70 p-4 sm:p-5">
      <summary className="cursor-pointer text-xl font-bold">Organiser mes cours</summary>
      <div className="mt-5 grid min-w-0 gap-5 border-t border-ink/10 pt-5">
        <p className="text-sm text-ink/65">Années, matières, cours, chapitres facultatifs, parties attendues et corrections manuelles.</p>
        <form action={createSchoolYear} className="grid min-w-0 gap-2 rounded-xl bg-white p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"><Field name="label" label="Nouvelle année" required /><Field name="startYear" label="Début" /><Field name="endYear" label="Fin" /><button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">Ajouter</button></form>
        {years.map((year) => <AdvancedYear key={year.id} year={year} />)}
      </div>
    </details>
  </div>;
}

type Tree = Awaited<ReturnType<typeof prisma.schoolYear.findMany>>[number] & {
  subjects: Array<{ id: string; title: string; themes: Array<{ id: string; title: string; orderVersion: number; chapters: Array<{ id: string; title: string }>; parts: Array<{ id: string; title: string; referenceLabel: string | null; chapterId: string | null }> }> }>;
};

function AdvancedYear({ year }: { year: Tree }) {
  return <section className="grid min-w-0 gap-3 rounded-xl border border-ink/10 bg-white p-3">
    <form action={updateSchoolYear} className="flex min-w-0 gap-2"><input type="hidden" name="schoolYearId" value={year.id} /><input name="label" defaultValue={year.label} aria-label="Modifier l’année" className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-semibold" /><button className="rounded-lg border px-3 py-2">Modifier</button></form>
    <form action={createSubject} className="grid gap-2 sm:grid-cols-[1fr_auto]"><input type="hidden" name="schoolYearId" value={year.id} /><Field name="title" label="Ajouter une matière" required /><button className="rounded-lg bg-moss px-4 py-2 font-semibold text-white">Ajouter</button></form>
    {year.subjects.map((subject) => <div key={subject.id} className="grid min-w-0 gap-3 rounded-xl bg-paper p-3">
      <form action={updateSubject} className="flex min-w-0 gap-2"><input type="hidden" name="subjectId" value={subject.id} /><input name="title" defaultValue={subject.title} aria-label="Modifier la matière" className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-semibold" /><button className="rounded-lg border px-3 py-2">Modifier</button></form>
      <form action={createCourseTheme} className="grid gap-2 sm:grid-cols-[1fr_auto]"><input type="hidden" name="subjectId" value={subject.id} /><Field name="title" label="Ajouter un cours" required /><button className="rounded-lg border border-moss px-4 py-2 font-semibold text-moss">Ajouter</button></form>
      {subject.themes.map((course) => <AdvancedCourse key={course.id} course={course} />)}
    </div>)}
  </section>;
}

function AdvancedCourse({ course }: { course: Tree["subjects"][number]["themes"][number] }) {
  return <div className="grid min-w-0 gap-3 rounded-xl border bg-white p-3">
    <form action={updateCourseTheme} className="flex min-w-0 gap-2"><input type="hidden" name="courseThemeId" value={course.id} /><input name="title" defaultValue={course.title} aria-label="Modifier le cours" className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-semibold" /><button className="rounded-lg border px-3 py-2">Modifier</button></form>
    <div className="flex flex-wrap gap-2"><form action={sortCourseThemeParts}><input type="hidden" name="courseThemeId" value={course.id} /><input type="hidden" name="orderVersion" value={course.orderVersion} /><button className="rounded-lg border px-3 py-2 text-sm">Trier les repères</button></form></div>
    <form action={createChapter} className="grid gap-2 sm:grid-cols-[1fr_auto]"><input type="hidden" name="courseThemeId" value={course.id} /><Field name="title" label="Ajouter un chapitre facultatif" required /><button className="rounded-lg border px-3 py-2">Ajouter</button></form>
    {course.chapters.map((chapter) => <form key={chapter.id} action={updateChapter} className="flex gap-2"><input type="hidden" name="chapterId" value={chapter.id} /><input name="title" defaultValue={chapter.title} aria-label="Modifier le chapitre" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg border px-3 py-2">Modifier</button></form>)}
    <form action={createCoursePart} className="grid min-w-0 gap-2 rounded-lg bg-paper p-3 sm:grid-cols-2"><input type="hidden" name="courseThemeId" value={course.id} /><input type="hidden" name="orderVersion" value={course.orderVersion} /><Field name="title" label="Titre de la partie" /><Field name="referenceLabel" label="Repère, par exemple 4.2" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="documentExpected" /> Document encore attendu</label><select name="chapterId" aria-label="Chapitre facultatif" className="rounded-lg border px-3 py-2"><option value="">Sans chapitre</option>{course.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select><button className="rounded-lg bg-clay px-4 py-2 font-semibold text-white sm:col-span-2">Ajouter la partie</button></form>
    {course.parts.map((part, index) => <div key={part.id} className="grid min-w-0 gap-2 rounded-lg border p-3">
      <div className="flex justify-between gap-2"><strong>{part.referenceLabel ?? "Sans repère"} — {part.title}</strong><div className="flex gap-1"><MoveButton partId={part.id} version={course.orderVersion} direction="up" disabled={index === 0} /><MoveButton partId={part.id} version={course.orderVersion} direction="down" disabled={index === course.parts.length - 1} /></div></div>
      <form action={updateCoursePart} className="grid min-w-0 gap-2 sm:grid-cols-3"><input type="hidden" name="partId" value={part.id} /><input type="hidden" name="orderVersion" value={course.orderVersion} /><Field name="title" label="Titre" value={part.title} required /><Field name="referenceLabel" label="Repère" value={part.referenceLabel ?? ""} /><label className="grid gap-1 text-sm"><span>Chapitre</span><select name="chapterId" defaultValue={part.chapterId ?? ""} className="rounded-lg border px-3 py-2"><option value="">Sans chapitre</option>{course.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><button className="rounded-lg border px-3 py-2 sm:col-span-3">Enregistrer</button></form>
    </div>)}
  </div>;
}

function MoveButton({ partId, version, direction, disabled }: { partId: string; version: number; direction: "up" | "down"; disabled: boolean }) {
  return <form action={moveCoursePart}><input type="hidden" name="partId" value={partId} /><input type="hidden" name="orderVersion" value={version} /><input type="hidden" name="direction" value={direction} /><button disabled={disabled} aria-label={direction === "up" ? "Monter" : "Descendre"} className="rounded border px-3 py-1 disabled:opacity-30">{direction === "up" ? "↑" : "↓"}</button></form>;
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    "file-required": "Choisis un fichier PDF ou ODT.",
    "file-too-large": "Le document dépasse la limite de 25 Mio.",
    "format-or-size": "Le document doit être un PDF ou un ODT valide de 25 Mio maximum.",
    "upload-failed": "Le document n’a pas pu être conservé.",
    "smart-import-failed": "Le cours n’a pas pu être ajouté. Aucun cours vide ni document partiel n’a été conservé.",
    "stale-order": "Le cours a changé entre-temps. Relance la proposition avant de confirmer.",
    "already-exists": "Cet élément existe déjà.",
    "write-failed": "La modification n’a pas pu être enregistrée.",
  };
  return messages[code] ?? "La demande n’a pas pu être traitée.";
}
