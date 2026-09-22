'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export type Flashcard={front:string;back:string;refs:Array<{passageId:string;quote:string}>};

export function FlashcardDeck({courseId,cards}:{courseId:string;cards:Flashcard[]}) {
  const [index,setIndex]=useState(0);const [revealed,setRevealed]=useState(false);
  const card=cards[index];
  const previous=()=>{setIndex(value=>Math.max(0,value-1));setRevealed(false);};
  const next=()=>{setIndex(value=>Math.min(cards.length-1,value+1));setRevealed(false);};
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='ArrowLeft')previous();if(event.key==='ArrowRight')next();if(event.key===' '||event.key==='Enter'){event.preventDefault();setRevealed(value=>!value);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[cards.length]);
  if(!card)return null;
  return <section className="grid gap-4" aria-label="Flashcards"><p role="status" className="text-center font-semibold">Carte {index+1} sur {cards.length}</p><button type="button" onClick={()=>setRevealed(value=>!value)} aria-pressed={revealed} className="grid min-h-64 w-full place-items-center rounded-2xl border-2 border-moss bg-paper p-6 text-center shadow-sm focus-visible:outline focus-visible:outline-4 focus-visible:outline-moss"><span className="grid gap-4"><span className="text-xs font-bold uppercase tracking-wide text-ink/60">{revealed?'Réponse':'Question ou terme'}</span><strong className="text-xl leading-8">{revealed?card.back:card.front}</strong><span className="text-sm text-moss underline">{revealed?'Masquer la réponse':'Retourner la carte'}</span></span></button><div className="grid grid-cols-2 gap-3"><button type="button" onClick={previous} disabled={index===0} className="min-h-12 rounded-xl border px-4 font-bold disabled:opacity-50">Précédent</button><button type="button" onClick={next} disabled={index===cards.length-1} className="min-h-12 rounded-xl bg-moss px-4 font-bold text-white disabled:opacity-50">Suivant</button></div><button type="button" onClick={()=>{setIndex(0);setRevealed(false);}} className="min-h-12 w-fit rounded-xl border px-4 font-bold">Recommencer</button><details className="rounded-lg border border-ink/10 p-3 text-sm"><summary className="cursor-pointer font-semibold">Voir dans mon cours</summary><ul className="mt-3 grid gap-3">{card.refs.map((ref,refIndex)=><li key={`${ref.passageId}-${refIndex}`}><blockquote className="whitespace-pre-wrap border-l-2 border-moss pl-3">{ref.quote}</blockquote><Link className="text-moss underline" href={`/courses/${courseId}/passage/${ref.passageId}`}>Ouvrir le passage source</Link></li>)}</ul></details><p className="text-sm text-ink/65">Clavier : flèches pour naviguer, Entrée ou espace pour retourner.</p></section>;
}
