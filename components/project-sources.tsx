type ProjectSource = {
  id: string;
  url: string;
  title: string | null;
  domain: string | null;
  sourceOrder: number;
};

function safeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function ProjectSources({
  sources,
  researchUsed,
}: {
  sources: ProjectSource[];
  researchUsed: boolean;
}) {
  const safeSources = sources
    .map((source) => ({ ...source, safeUrl: safeExternalUrl(source.url) }))
    .filter((source): source is ProjectSource & { safeUrl: string } => Boolean(source.safeUrl))
    .slice(0, 8);

  return (
    <section className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-xl font-semibold text-ink">Sources documentaires</h2>
        <p className="mt-1 text-sm leading-6 text-ink/60">
          {researchUsed
            ? "BlablaBox a utilisé une recherche Web pour préparer cette réponse."
            : "Aucune recherche Web n'a été nécessaire pour cette réponse."}
        </p>
      </div>

      {safeSources.length ? (
        <ol className="grid gap-3">
          {safeSources.map((source) => (
            <li key={source.id} className="rounded-xl bg-mist p-3">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-ink/60">[{source.sourceOrder + 1}]</span>
                <a
                  href={source.safeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-semibold text-moss underline decoration-moss/30 underline-offset-4 hover:decoration-moss"
                >
                  {source.title ?? source.domain ?? source.safeUrl}
                </a>
              </div>
              {source.domain ? (
                <p className="mt-1 break-all text-xs text-ink/55">{source.domain}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : researchUsed ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La recherche a été utilisée, mais aucune URL exploitable n&apos;a été renvoyée.
        </p>
      ) : null}
    </section>
  );
}
