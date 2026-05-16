export function ScriptView({ script }: { script: string | null }) {
  if (!script) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Aucun script n'a été généré pour ce projet.
      </p>
    );
  }

  return (
    <article className="max-h-none whitespace-pre-wrap break-words rounded-md border border-ink/10 bg-white p-4 text-[15px] leading-7 text-ink shadow-sm sm:p-6 sm:text-base sm:leading-8">
      {script}
    </article>
  );
}