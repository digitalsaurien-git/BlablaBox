import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LearningMode, Passage } from './learning-contract.ts';
import { LearningFailure } from './learning-errors.ts';

export const EVIDENCE_VERSION='evidence-1';
export const MAX_EVIDENCE_SEGMENTS=96;
export const MAX_EVIDENCE_LENGTH=400;
export type EvidenceCategory='course'|'answer'|'question'|'mixed';
export type EvidenceSegment={id:string;passageId:string;start:number;end:number;text:string;category:EvidenceCategory};
export const usesEvidence=(mode:LearningMode)=>['explain','summary','essential'].includes(mode);
const questionStart=/^(?:(?:\d+[.)]\s*)?(?:questions?\b|exercices?\b|consigne\b|qui\b|que\b|quel\w*\b|comment\b|pourquoi\b|quand\b|où\b|cite\b|donne\b|explique\b|complète\b|répond\w*\b|indique\b|compare\b|nomme\b|relève\b))/iu;
const answerStart=/^(?:réponses?|correction|corrigé|solution)\s*(?:\d+\s*)?:/iu;
const marker=/(?<!\p{L})(?:questions?|réponses?|correction|corrigé|solution|définition|date|cours)\s*(?:\d+\s*)?:/giu;
const normalized=(text:string)=>text.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g,' ').trim();

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
const evidenceBlock=z.object({text:z.string().min(1).max(450),kind:z.enum(['explanation','example']),segmentIds:z.array(z.string().min(1)).min(1).max(2)}).strict();
export const evidenceSchema=(mode:LearningMode,minimum:1|2=1)=>z.object({blocks:z.array(evidenceBlock).min(minimum).max(mode==='summary'?2:3)}).strict();

// Rebuild the catalog from the trusted snapshot, never from model coordinates.
export function evidenceContext(passages:Passage[]) {
  const owned=passages.map(p=>({...p}));
  const segments=factualEvidence(buildEvidence(owned));
  const byId=new Map(segments.map(e=>[e.id,e]));const byPassage=new Map(owned.map(p=>[p.id,p]));
  return {segments,resolve(raw:unknown) {
    const parsed=evidenceBlock.safeParse(raw);if(!parsed.success)throw new LearningFailure('INVALID_STRUCTURE');
    const {text,kind,segmentIds}=parsed.data;
    const citations=[...new Set(segmentIds)].map(id=>{
      const e=byId.get(id);const p=e&&byPassage.get(e.passageId);
      if(!e||!p||p.quality!=='verified'||p.text.slice(e.start,e.end)!==e.text)throw new LearningFailure('UNKNOWN_CITATION');
      return {passageId:p.id,quote:p.text.slice(e.start,e.end)};
    });
    return {text,kind,citations};
  }};
}

// Only the exact, accepted citations are sent as audit evidence. A full passage
// could contain unrelated questions, answers or personal material.
export function auditEvidence(refs:Array<{passageId:string;quote:string}>) {
  const seen=new Set<string>();
  return refs.filter(ref=>{const key=JSON.stringify(ref);if(seen.has(key))return false;seen.add(key);return true;}).map(ref=>({...ref}));
}
