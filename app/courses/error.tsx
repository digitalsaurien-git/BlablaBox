"use client";
import { MSG_COURSE_ERROR_BOUNDARY } from "@/lib/messages";

export default function CourseError({reset}:{reset:()=>void}) {
  return <section className="mx-auto grid max-w-2xl gap-4 rounded-2xl bg-white p-6" role="alert">
    <h2 className="text-xl font-bold">La demande n'a pas pu aboutir</h2>
    <p>{MSG_COURSE_ERROR_BOUNDARY}</p>
    <button type="button" onClick={reset} className="min-h-12 rounded-xl bg-moss px-5 py-3 font-semibold text-white">Revenir au formulaire</button>
  </section>;
}
