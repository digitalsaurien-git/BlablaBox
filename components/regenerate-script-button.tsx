"use client";

export function RegenerateScriptButton() {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm("Relancer la génération ? Le script actuel sera remplacé si la génération réussit.")) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center justify-center rounded-md bg-clay px-3 py-2 text-sm font-semibold text-white transition hover:bg-clay/90"
    >
      Relancer la génération
    </button>
  );
}