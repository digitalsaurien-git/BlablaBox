import Link from "next/link";
import { UnderstandForm } from "@/components/understand-form";

type UnderstandPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function UnderstandPage({ searchParams }: UnderstandPageProps) {
  const params = await searchParams;
  return (
    <div className="mx-auto grid max-w-3xl gap-6 pb-8">
      <Link href="/" className="w-fit text-sm font-medium text-ink/65 transition hover:text-ink">
        ← Retour à l&apos;accueil
      </Link>
      <header className="grid gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">
          Comprendre &amp; écouter
        </p>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Une question suffit pour commencer.</h1>
        <p className="max-w-2xl leading-7 text-ink/70">
          Choisis la forme de la réponse. BlablaBox adaptera ensuite le contenu à ton public et à ta façon d&apos;apprendre.
        </p>
      </header>
      <section className="rounded-2xl border border-ink/10 bg-paper/70 p-4 shadow-sm sm:p-6">
        <UnderstandForm hasError={params.error === "missing-request"} />
      </section>
    </div>
  );
}
