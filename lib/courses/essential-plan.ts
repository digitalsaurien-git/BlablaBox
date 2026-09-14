import { z } from 'zod';
import type { LearningOutput, Passage } from './learning-contract.ts';
import { essentialFacts, evidenceContext, type EssentialKind } from './evidence.ts';
import { flattenedPair, foldEvidence } from './flattened-evidence.ts';
import { LearningFailure } from './learning-errors.ts';

export type EssentialSlot={id:string;segmentId:string;focus:EssentialKind;requiredTerms:string[];requiredValue?:string};
const card=z.object({slotId:z.string().min(1),title:z.string().min(1).max(60),text:z.string().min(1).max(450),kind:z.enum(['explanation','example']),segmentIds:z.array(z.string().min(1)).length(1)}).strict();
const contains=(text:string,term:string)=>new RegExp(`(?<![\\p{L}\\p{N}])${foldEvidence(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}])`,'u').test(foldEvidence(text));

// Build from the owned, verified snapshot before generating. These IDs and the
// requested terms are server constraints, not optional model suggestions.
export function essentialPlan(passages:Passage[],subject='') {
  const context=evidenceContext(passages);
  const facts=essentialFacts(context.segments,subject);
  const seenAnchors=new Set<string>();
  const candidates=facts.map(fact=>{
    const segment=context.segments.find(segment=>segment.id===fact.segmentId)!;
    const pair=flattenedPair(segment.text);
    const association=pair??(fact.kinds.includes('association')?{term:fact.labels[0],value:fact.labels[1]}:undefined);
    const definition=segment.text.replace(/^(?:cours|réponse|définition)\s*:\s*/iu,'').match(/^(.{2,60}?)\s+(?:est|désigne|signifie|s['’]appelle|se traduit par)\s+(.{3,})/iu);
    const definitionTerm=definition?.[1].replace(/^(?:(?:le|la|les|un|une)\s+|l['’])/iu,'').trim();
    const requiredTerms=association?[association.term]:definitionTerm?[definitionTerm]:[];
    const slot:EssentialSlot={id:`s_${segment.id}`,segmentId:segment.id,focus:fact.focus,requiredTerms,...(association?{requiredValue:association.value}:{})};
    const key=foldEvidence(association?`${association.term}|${association.value}`:segment.text);
    return {slot,priority:fact.priority,anchored:requiredTerms.length>0,key};
  }).filter(candidate=>{if(seenAnchors.has(candidate.key))return false;seenAnchors.add(candidate.key);return true;});
  const slots:EssentialSlot[]=[];
  const categories=new Set<EssentialKind>();
  while(slots.length<3&&candidates.length) {
    candidates.sort((a,b)=>Number(b.anchored)-Number(a.anchored)||Number(categories.has(a.slot.focus))-Number(categories.has(b.slot.focus))||b.priority-a.priority||a.slot.id.localeCompare(b.slot.id));
    const next=candidates.shift()!;slots.push(next.slot);categories.add(next.slot.focus);
  }
  const schema=z.object({blocks:z.array(card).length(slots.length)}).strict();
  const byId=new Map(slots.map(slot=>[slot.id,slot]));
  const checkAnchor=(slot:EssentialSlot,title:string|undefined,text:string)=>{
    const content=[title,text].filter(Boolean).join(' ');
    if(slot.requiredTerms.some(term=>!contains(content,term)))throw new LearningFailure('INVALID_STRUCTURE');
    if(slot.requiredValue&&!contains(content,slot.requiredValue))throw new LearningFailure('UNVERIFIABLE_NUMBER');
  };
  const resolve=(raw:unknown)=>{
    const parsed=card.safeParse(raw);
    if(!parsed.success)throw new LearningFailure('INVALID_STRUCTURE');
    const {slotId,...block}=parsed.data,slot=byId.get(slotId);
    if(!slot||block.segmentIds[0]!==slot.segmentId)throw new LearningFailure('UNKNOWN_CITATION');
    checkAnchor(slot,block.title,block.text);
    return context.resolve(block);
  };
  return {slots,schema,context,facts,resolve,
    validateRaw(raw:unknown) {
      const parsed=schema.safeParse(raw);
      if(!parsed.success||new Set(parsed.data.blocks.map(block=>block.slotId)).size!==slots.length)throw new LearningFailure('INVALID_STRUCTURE');
      for(const block of parsed.data.blocks)resolve(block);
    },
    assertComplete(data:LearningOutput) {
      if(data.blocks.length!==slots.length)throw new LearningFailure('INVALID_STRUCTURE');
      for(const slot of slots) {
        const segment=context.segments.find(segment=>segment.id===slot.segmentId)!;
        const matches=data.blocks.filter(block=>block.citations.length===1&&block.citations[0].passageId===segment.passageId&&block.citations[0].quote===segment.text);
        if(matches.length!==1)throw new LearningFailure('UNKNOWN_CITATION');
        checkAnchor(slot,matches[0].title,matches[0].text);
      }
    },
  };
}
