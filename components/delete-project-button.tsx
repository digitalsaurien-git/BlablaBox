"use client";

export function DeleteProjectButton() {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm("Supprimer ce projet ? Cette action est definitive.")) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
    >
      <span aria-hidden="true">x</span>
      Supprimer
    </button>
  );
}