"use client";

export default function CourseError({reset}:{reset:()=>void}) {
  return <section className="mx-auto grid max-w-2xl gap-4 rounded-2xl bg-white p-6" role="alert">
    <h2 className="text-xl font-bold">La demande n’a pas pu aboutir</h2>
    <p>La connexion a peut-être été interrompue. Reviens au formulaire pour retrouver ton travail. Aucune préparation ne sera relancée automatiquement.</p>
    <button type="button" onClick={reset} className="min-h-12 rounded-xl bg-moss px-5 py-3 font-semibold text-white">Revenir au formulaire</button>
  </section>;
}
