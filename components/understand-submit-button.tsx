"use client";

import { useFormStatus } from "react-dom";

export function UnderstandSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-clay px-5 py-3.5 text-base font-semibold text-white transition hover:bg-clay/90 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-44"
    >
      {pending ? "Création en cours..." : "Générer"}
    </button>
  );
}
