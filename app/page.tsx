import Link from "next/link";
import { Library, Wand2 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="grid gap-10">
      <section className="grid min-h-[calc(100vh-12rem)] content-center gap-8 py-8">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-clay">
            MVP technique
          </p>
          <h1 className="text-4xl font-bold text-ink sm:text-5xl">
            BlablaBox transforme une idee en script audio pedagogique.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/75">
            Cree un projet, choisis une duree de 3 a 20 minutes et genere un script
            narratif avec un provider mock. Le socle reste pret pour le futur MP3.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-5 py-3 font-semibold text-paper transition hover:bg-moss"
          >
            <span aria-hidden="true">+</span>
            Nouveau projet
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-5 py-3 font-semibold text-ink transition hover:bg-mist"
          >
            <span aria-hidden="true">[]</span>
            Bibliotheque
          </Link>
        </div>
      </section>
    </div>
  );
}
