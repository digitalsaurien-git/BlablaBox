"use client";
import { useFormStatus } from 'react-dom';
export function LearningSubmit({children,className}:{children:React.ReactNode;className?:string}) {
  const {pending}=useFormStatus();
  return <div className="grid gap-2"><button type="submit" disabled={pending} className={className} aria-busy={pending}>{pending?'Préparation en cours…':children}</button>{pending?<p role="status" className="text-sm">Tu peux patienter ici. Ton travail est en cours de préparation.</p>:null}</div>;
}
