import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { HomeworkList } from "./homework-list";
import { AddHomeworkForm } from "./add-homework-form";
import {
  createHomeworkAction,
  updateHomeworkStatusAction,
  linkHomeworkToCourseAction,
  deleteHomeworkAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    "missing-fields": "Tous les champs sont requis.",
    "invalid-date": "La date est invalide.",
    "create-failed": "Impossible de créer le devoir.",
    "update-failed": "Impossible de mettre à jour le devoir.",
    "link-failed": "Impossible de rattacher le cours.",
    "delete-failed": "Impossible de supprimer le devoir.",
    "not-found": "Devoir introuvable.",
    "course-not-found": "Cours introuvable.",
  };
  return messages[code] ?? "Une erreur s'est produite.";
}

export default async function HomeworkPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;

  // Load all active homework, newest due date first
  const homeworks = await prisma.homework.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { dueDate: "asc" },
    include: {
      courseTheme: {
        select: { id: true, title: true, subject: { select: { title: true } } },
      },
    },
  });

  // Load all course themes for the link selector
  const allThemes = await prisma.courseTheme.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      subject: { select: { title: true } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="grid min-w-0 gap-7 break-words pb-10">
      <header className="grid gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">
          Mes devoirs
        </p>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          Planning des devoirs
        </h1>
        <p className="max-w-2xl leading-7 text-ink/70">
          Tes devoirs à faire, triés par date de rendu.{" "}
          <Link href="/courses" className="underline underline-offset-2">
            Gérer mes cours →
          </Link>
        </p>
      </header>

      {first(params.error) ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage(first(params.error) ?? "")}
        </p>
      ) : null}

      {first(params.added) ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          Devoir ajouté.
        </p>
      ) : null}

      <AddHomeworkForm createAction={createHomeworkAction} />

      <HomeworkList
        homeworks={homeworks.map((hw) => ({
          id: hw.id,
          dueDate: hw.dueDate.toISOString(),
          subjectLabel: hw.subjectLabel,
          description: hw.description,
          status: hw.status,
          courseUnresolved: hw.courseUnresolved,
          courseTheme: hw.courseTheme
            ? {
                id: hw.courseTheme.id,
                title: hw.courseTheme.title,
                subjectTitle: hw.courseTheme.subject.title,
              }
            : null,
        }))}
        allThemes={allThemes.map((t) => ({
          id: t.id,
          title: t.title,
          subjectTitle: t.subject.title,
        }))}
        today={today.toISOString()}
        updateStatusAction={updateHomeworkStatusAction}
        linkToCourseAction={linkHomeworkToCourseAction}
        deleteAction={deleteHomeworkAction}
      />
    </div>
  );
}
