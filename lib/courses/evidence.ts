import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LearningMode, Passage } from './learning-contract.ts';
import { LearningFailure } from './learning-errors.ts';

export const EVIDENCE_VERSION='evidence-1';
export const ESSENTIAL_VERSION='essential-2';
export const MAX_EVIDENCE_SEGMENTS=96;
export const MAX_EVIDENCE_LENGTH=400;
export type EvidenceCategory='course'|'answer'|'question'|'mixed';
export type EvidenceSegment={id:string;passageId:string;start:number;end:number;text:string;category:EvidenceCategory};
export type EssentialSubject='history-geography'|'mathematics'|'language'|'other';
export type EssentialKind='association'|'date'|'duration'|'proper-name'|'definition'|'place'|'rule'|'method'|'formula'|'vocabulary'|'cause'|'consequence'|'step'|'value'|'notion';
export type EssentialFact={segmentId:string;focus:EssentialKind;kinds:EssentialKind[];labels:string[];priority:number};
export const usesEvidence=(mode:LearningMode)=>['explain','summary','essential'].includes(mode);
const questionStart=/^(?:(?:\d+[.)]\s*)?(?:questions?\b|exercices?\b|consigne\b|qui\b|que\b|quel\w*\b|comment\b|pourquoi\b|quand\b|où\b|cite\b|donne\b|explique\b|complète\b|répond\w*\b|indique\b|compare\b|nomme\b|relève\b))/iu;
const answerStart=/^(?:réponses?|correction|corrigé|solution)\s*(?:\d+\s*)?:/iu;
const marker=/(?<!\p{L})(?:questions?|réponses?|correction|corrigé|solution|définition|date|cours)\s*(?:\d+\s*)?:/giu;
const normalized=(text:string)=>text.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g,' ').trim();
const folded=(text:string)=>normalized(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const properNameStop=new Set(['cours','question','réponse','reponse','définition','definition','date','exercice','solution','correction','vrai','faux']);

export function essentialSubject(subject=''):EssentialSubject {
  const value=folded(subject);
  if(/\b(?:histoire|geographie|geo)\b/u.test(value))return 'history-geography';
  if(/\bmath(?:s|ematiques?)?\b/u.test(value))return 'mathematics';
  if(/\b(?:francais|anglais|espagnol|allemand|italien|latin|grec|langue)\b/u.test(value))return 'language';
  return 'other';
}

const unique=(values:string[])=>[...new Set(values.map(value=>value.trim()).filter(Boolean))];
function matches(text:string,pattern:RegExp,group=0) {
  return unique([...text.matchAll(pattern)].map(match=>match[group]??'')).slice(0,4);
}

// These hints rank trusted segments; they never create facts. The model still
// receives the exact segment and citations are reconstructed from its ID.
export function essentialFacts(segments:EvidenceSegment[],subject=''):EssentialFact[] {
  const profile=essentialSubject(subject);
  const weights:Record<EssentialSubject,Partial<Record<EssentialKind,number>>>= {
    'history-geography':{'association':100,'proper-name':22,'date':22,'duration':20,'place':18,'cause':16,'consequence':16,'definition':8},
    mathematics:{'definition':24,'rule':23,'method':22,'formula':22,'value':16,'step':14},
    language:{'vocabulary':24,'rule':23,'definition':20,'method':14,'proper-name':6},
    other:{'definition':20,'notion':16,'step':16,'value':16,'proper-name':12,'date':12,'cause':12,'consequence':12},
  };
  const ranked=factualEvidence(segments).map(segment=>{
    const text=segment.text;
    const units=matches(text,/\b\d+(?:[.,]\d+)?\s*(?:Ma|Ga|ka|millions?\s+d['’]années?|milliers?\s+d['’]années?|ans?|s(?:econdes?)?|min(?:utes?)?|h(?:eures?)?|km|m|cm|mm|kg|g|%|°C)\b/giu);
    const dates=unique([...units.filter(value=>/\b(?:Ma|Ga|ka|années?|ans?)\b/iu.test(value)),...matches(text,/\b(?:1\d{3}|20\d{2})\b/gu)]).slice(0,4);
    const names=matches(text,/(?<![\p{L}\p{M}])([\p{Lu}][\p{L}\p{M}’'-]{2,}(?:\s+[\p{Lu}][\p{L}\p{M}’'-]{2,})*)/gu,1).filter(value=>!properNameStop.has(folded(value)));
    const places=matches(text,/(?<![\p{L}\p{M}])((?:en|au|aux|à)\s+[\p{Lu}][\p{L}\p{M}’'-]{2,}(?:\s+[\p{Lu}][\p{L}\p{M}’'-]{2,})*)/gu,1);
    const kinds:EssentialKind[]=[];const labels:string[]=[];
    const add=(kind:EssentialKind,values:string[]=[])=>{if(!kinds.includes(kind))kinds.push(kind);labels.push(...values);};
    if(names.length&&dates.length)add('association',[names[0],dates[0]]);
    if(dates.length)add('date',dates);
    if(units.some(value=>/\b(?:ans?|s(?:econdes?)?|min(?:utes?)?|h(?:eures?)?)\b/iu.test(value)))add('duration',units);
    if(names.length)add('proper-name',names);
    if(places.length)add('place',places);
    if(/\b(?:définition|désigne|signifie|s['’]appelle|est (?:un|une|le|la|l['’]))\b/iu.test(text))add('definition');
    if(/\b(?:règle|propriété|théorème|toujours|jamais|doit|accorde?)\b/iu.test(text))add('rule');
    if(/\b(?:méthode|pour (?:calculer|résoudre|trouver)|on (?:calcule|résout|commence)|procédure)\b/iu.test(text))add('method');
    if(/[=+×÷]|\b(?:formule|équation|périmètre|aire)\b/iu.test(text))add('formula');
    if(/\b(?:vocabulaire|mot|expression|se traduit|synonyme|contraire)\b/iu.test(text))add('vocabulary');
    if(/\b(?:car|parce que|à cause de|provoqué par|cause)\b/iu.test(text))add('cause');
    if(/\b(?:donc|entraîne|provoque|a pour conséquence|conséquence|ainsi)\b/iu.test(text))add('consequence');
    if(/\b(?:étape|d['’]abord|ensuite|enfin|premièrement|deuxièmement)\b/iu.test(text))add('step');
    if(units.length)add('value',units);
    if(!kinds.length)add('notion');
    const focus=kinds.slice().sort((a,b)=>(weights[profile][b]??2)-(weights[profile][a]??2))[0]??'notion';
    const priority=10+kinds.reduce((sum,kind)=>sum+(weights[profile][kind]??2),0)+(segment.category==='answer'?3:0);
    return {segmentId:segment.id,focus,kinds,labels:unique(labels).slice(0,4),priority};
  }).sort((a,b)=>b.priority-a.priority||a.segmentId.localeCompare(b.segmentId)).slice(0,24);
  const diverse:EssentialFact[]=[];const rest:EssentialFact[]=[];const focuses=new Set<EssentialKind>();
  for(const fact of ranked) {
    if(diverse.length<3&&!focuses.has(fact.focus)){diverse.push(fact);focuses.add(fact.focus);}
    else rest.push(fact);
  }
  return [...diverse,...rest];
}

export function orderEssentialSegments(segments:EvidenceSegment[],facts:EssentialFact[]) {
  const rank=new Map(facts.map((fact,index)=>[fact.segmentId,{priority:fact.priority,index}]));
  return [...segments].sort((a,b)=>{
    const left=rank.get(a.id),right=rank.get(b.id);
    return (right?.priority??0)-(left?.priority??0)||(left?.index??Number.MAX_SAFE_INTEGER)-(right?.index??Number.MAX_SAFE_INTEGER);
  });
}

// Coordinates always refer to the stored passage. No OCR, rewriting or persisted
// extraction is involved. Only the authenticated ownedCourse snapshot is accepted.
export function buildEvidence(passages:Passage[]):EvidenceSegment[] {
  if(passages.length>2000||passages.reduce((n,p)=>n+p.text.length,0)>60000)throw new LearningFailure('SOURCE_UNUSABLE');
  const ids=new Set<string>();const result:EvidenceSegment[]=[];
  for(const p of passages) {
    if(ids.has(p.id))throw new LearningFailure('UNKNOWN_CITATION');
    ids.add(p.id);if(p.quality!=='verified')continue;
    const boundaries=new Set([0,p.text.length]);
    for(const m of p.text.matchAll(/(?:[.!?;](?=\s|$)|\r?\n+|[•●]\s*|(?<=\s)(?:[-–]\s+|\d+[.)]\s+))/gu)) {
      // Bullets and numbered labels belong to the next segment.
      boundaries.add(/[•●]|^[-–]|^\d/.test(m[0])?m.index:m.index+m[0].length);
    }
    for(const m of p.text.matchAll(marker))boundaries.add(m.index);
    const points=[...boundaries].sort((a,b)=>a-b);
    let context:EvidenceCategory='course';
    for(let i=0;i<points.length-1;i++) {
      let start=points[i],end=points[i+1];
      while(start<end&&/\s/.test(p.text[start]))start++;
      while(end>start&&/\s/.test(p.text[end-1]))end--;
      if(start===end)continue;
      const raw=p.text.slice(start,end);
      const isAnswer=answerStart.test(raw),isQuestion=questionStart.test(raw)||raw.includes('?');
      const explicitCourse=/^(?:cours|définition|date)\s*:/iu.test(raw);
      if(isAnswer)context='answer';else if(isQuestion)context='question';else if(explicitCourse)context='course';
      const category:EvidenceCategory=isAnswer&&raw.includes('?')?'mixed':isQuestion?'question':context;
      // Keep question continuations quarantined until an explicit answer/course
      // marker. A declarative-looking option is not evidence of a correct answer.
      while(start<end) {
        let stop=Math.min(start+MAX_EVIDENCE_LENGTH,end);
        if(stop<end){const space=p.text.lastIndexOf(' ',stop);if(space>start)stop=space;}
        // Long spans cut at a length limit are ambiguous fragments, never facts.
        const categoryForPart=raw.length>MAX_EVIDENCE_LENGTH?'mixed':category;
        const text=p.text.slice(start,stop);
        if(text.trim())result.push({id:'e_'+createHash('sha256').update(JSON.stringify([EVIDENCE_VERSION,p.id,p.text,start,stop])).digest('hex').slice(0,24),passageId:p.id,start,end:stop,text,category:categoryForPart});
        start=stop;while(start<end&&/\s/.test(p.text[start]))start++;
      }
    }
  }
  // Prefer useful facts when the bounded catalog cannot contain the whole course.
  const priority=(e:EvidenceSegment)=>(e.category==='course'||e.category==='answer'?10:0)+(e.category==='answer'?3:0)+(/\d|\best\b|définition|car\b|donc\b/iu.test(e.text)?2:0);
  return result.sort((a,b)=>priority(b)-priority(a)).slice(0,MAX_EVIDENCE_SEGMENTS);
}

export function factualEvidence(segments:EvidenceSegment[]) {
  const seen=new Set<string>();
  return segments.filter(e=>{
    if(!['course','answer'].includes(e.category)||e.text.trim().length<3||!/[\p{L}\d]/u.test(e.text)||/^(?:cours|réponse|définition|date)\s*:\s*$/iu.test(e.text))return false;
    const key=normalized(e.text);if(seen.has(key))return false;seen.add(key);return true;
  });
}
const evidenceBlock=z.object({title:z.string().min(1).max(60).optional(),text:z.string().min(1).max(450),kind:z.enum(['explanation','example']),segmentIds:z.array(z.string().min(1)).min(1).max(2)}).strict();
const essentialEvidenceBlock=evidenceBlock.extend({title:z.string().min(1).max(60)});
export const evidenceSchema=(mode:LearningMode,minimum:1|2=1)=>z.object({blocks:z.array(mode==='essential'?essentialEvidenceBlock:evidenceBlock).min(minimum).max(mode==='summary'?2:3)}).strict();

// Rebuild the catalog from the trusted snapshot, never from model coordinates.
export function evidenceContext(passages:Passage[]) {
  const owned=passages.map(p=>({...p}));
  const segments=factualEvidence(buildEvidence(owned));
  const byId=new Map(segments.map(e=>[e.id,e]));const byPassage=new Map(owned.map(p=>[p.id,p]));
  return {segments,resolve(raw:unknown) {
    const parsed=evidenceBlock.safeParse(raw);if(!parsed.success)throw new LearningFailure('INVALID_STRUCTURE');
    const {title,text,kind,segmentIds}=parsed.data;
    const citations=[...new Set(segmentIds)].map(id=>{
      const e=byId.get(id);const p=e&&byPassage.get(e.passageId);
      if(!e||!p||p.quality!=='verified'||p.text.slice(e.start,e.end)!==e.text)throw new LearningFailure('UNKNOWN_CITATION');
      return {passageId:p.id,quote:p.text.slice(e.start,e.end)};
    });
    return {...(title?{title}:{}),text,kind,citations};
  }};
}

// Only the exact, accepted citations are sent as audit evidence. A full passage
// could contain unrelated questions, answers or personal material.
export function auditEvidence(refs:Array<{passageId:string;quote:string}>) {
  const seen=new Set<string>();
  return refs.filter(ref=>{const key=JSON.stringify(ref);if(seen.has(key))return false;seen.add(key);return true;}).map(ref=>({...ref}));
}
