"use client";
import { useRef, useState, type MouseEvent } from 'react';
import { useFormStatus } from 'react-dom';
export function LearningSubmit({children,className}:{children:React.ReactNode;className?:string}) {
  const {pending}=useFormStatus();
  const locked=useRef(false);const [submitted,setSubmitted]=useState(false);const busy=pending||submitted;
  function submitOnce(event:MouseEvent<HTMLButtonElement>) {
    if(event.currentTarget.form&&!event.currentTarget.form.checkValidity())return;
    if(locked.current) {event.preventDefault();return;}
    locked.current=true;setSubmitted(true);
  }
  return <div className="grid gap-2"><button type="submit" disabled={busy} onClick={submitOnce} className={className} aria-busy={busy}>{busy?'Préparation en cours…':children}</button>{busy?<p role="status" className="text-sm">Tu peux patienter ici. Ton travail est en cours de préparation.</p>:null}</div>;
}
