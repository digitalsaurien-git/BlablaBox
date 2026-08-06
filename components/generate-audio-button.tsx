"use client";

import { useFormStatus } from "react-dom";

export function GenerateAudioButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="inline-flex items-center justify-center rounded-md bg-moss px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Génération en cours..." : "Générer l'audio"}
    </button>
  );
}
