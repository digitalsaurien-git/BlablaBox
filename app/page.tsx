import Link from "next/link";
import { ArrowRight, BookOpen, Library, PenLine } from "lucide-react";

export default function HomePage() {
  return (
    <div className="grid gap-8 py-4 sm:py-8">
      <section className="mx-auto grid max-w-3xl gap-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-clay">
          Lire, écouter, apprendre
        </p>
        <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Que veux-tu faire aujourd&apos;hui&nbsp;?
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-7 text-ink/70 sm:text-lg">
          BlablaBox transforme tes questions et tes idées en contenus clairs,
          adaptés et agréables à écouter.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-2">
        <Link
          href="/understand/new"
          className="group grid min-h-64 content-between gap-8 rounded-2xl bg-ink p-6 text-paper shadow-lg transition hover:-translate-y-1 hover:bg-moss sm:p-8"
        >
          <div>
            <BookOpen className="mb-6 size-9" aria-hidden="true" />
            <h2 className="text-2xl font-bold">Comprendre &amp; écouter</h2>
            <p className="mt-3 max-w-sm leading-7 text-paper/80">
              Pose une question, explore un sujet ou demande une histoire.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 font-semibold">
            Commencer
            <ArrowRight className="size-5 transition group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </Link>

        <div className="grid min-h-64 content-between gap-8 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <PenLine className="mb-6 size-9 text-clay" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-ink">Dicter &amp; rédiger</h2>
              <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-moss">
                Prochain parcours
              </span>
            </div>
            <p className="mt-3 max-w-sm leading-7 text-ink/65">
              Dicte tes idées, construis ton texte et écoute-le pour le corriger.
            </p>
          </div>
          <span className="font-semibold text-ink/45">Bientôt disponible</span>
        </div>
      </section>

      <Link
        href="/projects"
        className="mx-auto inline-flex items-center gap-3 rounded-full border border-ink/15 bg-white px-5 py-3 font-semibold text-ink transition hover:border-moss hover:text-moss"
      >
        <Library className="size-5" aria-hidden="true" />
        Ma bibliothèque
      </Link>
    </div>
  );
}
