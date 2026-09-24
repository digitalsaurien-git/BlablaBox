import type { z } from 'zod';
import { LearningFailure } from './learning-errors.ts';
import { citationSchema, learningSchema, normalizeAnswer, insufficient, type LearningOutput, type LearningMode, type Passage } from './learning-contract.ts';

export function validateGroundedOutput(raw:unknown, passages:Passage[], mode:LearningMode):LearningOutput {
  const parsed = learningSchema.safeParse(raw);
  if(!parsed.success)throw new LearningFailure('INVALID_STRUCTURE');
  const result=parsed.data;
  const byId = new Map(passages.map(p=>[p.id,p]));
  function verify(text:string, citations:z.infer<typeof citationSchema>[], evaluation=false) {
    for(const ref of citations) {
      const p = byId.get(ref.passageId);
      if(!p || (evaluation && p.quality!=='verified'))throw new LearningFailure('UNKNOWN_CITATION');
      if(!p.text.includes(ref.quote))throw new LearningFailure('QUOTE_MISMATCH');
    }
    const evidence = citations.map(c=>c.quote).join(' ');
    const numbers: string[] = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const sourceNumbers: string[] = evidence.match(/\d+(?:[.,]\d+)?/g) ?? [];
    if(numbers.some(n=>!sourceNumbers.includes(n)))throw new LearningFailure('UNVERIFIABLE_NUMBER');
    const unitPattern=/\b\d+(?:[.,]\d+)?\s*(?:Ma|Ga|ka|millions?\s+d['’]années?|milliers?\s+d['’]années?|ans?|s(?:econdes?)?|min(?:utes?)?|h(?:eures?)?|km|m|cm|mm|kg|g|%|°C)\b/giu;
    const measures=[...text.matchAll(unitPattern)].map(match=>normalizeAnswer(match[0]));
    const sourceMeasures=new Set([...evidence.matchAll(unitPattern)].map(match=>normalizeAnswer(match[0])));
    if(measures.some(measure=>!sourceMeasures.has(measure)))throw new LearningFailure('UNVERIFIABLE_NUMBER');
    if(/https?:\/\/|<\/?(?:script|iframe)|storageKey|DATABASE_URL/i.test(text))throw new LearningFailure('INVALID_STRUCTURE');
  }
  for(const b of result.blocks) verify([b.title,b.text].filter(Boolean).join(' '),b.citations);
  for(const q of result.questions) {
    verify([q.prompt,q.explanation,...(mode==='quiz'&&q.type==='mcq'?[]:q.choices),...q.expected,...q.variants].join(' '),q.citations,true);
    if(q.choices.some(c=>/https?:\/\/|<\/?(?:script|iframe)|storageKey|DATABASE_URL/i.test(c)))throw new LearningFailure('INVALID_STRUCTURE');
    const quotes = q.citations.map(c=>normalizeAnswer(c.quote)).join(' ');
    if(new Set(q.choices.map(normalizeAnswer)).size!==q.choices.length) throw new Error('Question ambiguë.');
    if(q.type==='mcq' || q.type==='boolean') {
      if(q.expected.length!==1 || !q.choices.includes(q.expected[0]) || q.choices.length<2) throw new Error('Question ambiguë.');
      if(q.type==='boolean' && q.choices.join('|')!=='Vrai|Faux') throw new Error('Question ambiguë.');
    }
    if(q.type==='gap' && (q.expected.length!==1 || !q.prompt.includes('___'))) throw new Error('Question ambiguë.');
    if(q.type!=='gap' && q.variants.length) throw new Error('Variantes non autorisées.');
    if(q.type==='gap' && q.variants.some(v=>normalizeAnswer(v)!==normalizeAnswer(q.expected[0]))) throw new Error('Variante non vérifiable.');
    if(q.type==='order' && (q.choices.length<2 || q.expected.length!==q.choices.length || new Set(q.expected).size!==q.expected.length || q.expected.some(s=>!q.choices.includes(s)))) throw new Error('Ordre ambigu.');
    if(q.type==='order' && q.expected.every(s=>/^\s*-?\d{1,6}\s*[:—–-]/.test(s))) {
      const dates=q.expected.map(s=>Number(s.match(/^\s*(-?\d+)/)![1]));
      if(dates.some((date,i)=>i>0&&date<=dates[i-1]))throw new Error('Ordre chronologique ambigu.');
    }
    if(q.type==='association' && (q.choices.length<2 || q.expected.length!==q.choices.length || q.expected.some(s=>!s.includes(' → ')))) throw new Error('Association ambiguë.');
    if(q.type!=='boolean' && q.expected.some(answer=>!answer.split(' → ').every(part=>quotes.includes(normalizeAnswer(part))))) throw new Error(insufficient);
    if(q.type==='boolean' && q.expected[0]==='Faux' && !q.prompt.includes('ne ') && !q.prompt.includes("n’") && !q.prompt.includes("n’")) throw new Error(insufficient);
    if(q.type==='mcq' && q.choices.filter(c=>quotes.includes(normalizeAnswer(c))).length!==1) throw new Error('Plusieurs réponses possibles.');
  }
  if(result.visual) result.visual.items.forEach((item,index)=>{
    verify(item.label+' '+item.detail,item.citations);
    if(item.parent>=index) throw new Error('Relation visuelle invalide.');
    if(result.visual?.type==='timeline' && !/\d/.test(item.label)) throw new Error(insufficient);
  });
  if(result.homework) {
    const h=result.homework;
    for(const b of [...h.hints,...h.correction]) verify(b.text,b.citations,true);
    verify(h.keywords.join(' '),h.citations,true);
    const evidence=normalizeAnswer(h.citations.map(c=>c.quote).join(' '));
    if(h.keywords.some(k=>!evidence.includes(normalizeAnswer(k)))) throw new Error(insufficient);
  }
  if(['quiz','gap','order','mix'].includes(mode) && !result.questions.length) throw new Error(insufficient);
  if(mode==='gap' && result.questions.some(q=>q.type!=='gap')) throw new Error('Format incorrect.');
  if(mode==='order' && result.questions.some(q=>q.type!=='order')) throw new Error('Format incorrect.');
  if(mode==='quiz' && result.questions.some(q=>!['mcq','boolean'].includes(q.type))) throw new Error('Format incorrect.');
  if(['visual','mindmap'].includes(mode) && !result.visual) throw new Error(insufficient);
  if(mode==='homework' && !result.homework) throw new Error(insufficient);
  return result;
}
