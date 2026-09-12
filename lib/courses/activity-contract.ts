import { z } from 'zod';
import { block, question, visual, learningSchema, validateGroundedOutput, type LearningMode, type LearningOutput, type Passage } from './learning-contract.ts';
import { LearningFailure, learningErrorCode, type LearningErrorCode } from './learning-errors.ts';

const shortBlock=block.extend({text:z.string().min(1).max(450),citations:z.array(z.object({passageId:z.string().min(1),quote:z.string().min(1).max(500)}).strict()).min(1).max(2)});
export const explainSchema=z.object({blocks:z.array(shortBlock).min(1).max(3)}).strict();
export const summarySchema=z.object({blocks:z.array(shortBlock).min(1).max(2)}).strict();
export const essentialSchema=z.object({blocks:z.array(shortBlock).min(1).max(3)}).strict();
export const visualSchema=z.object({blocks:z.array(shortBlock).min(1).max(3),visual}).strict();
export const revisionSchema=z.object({questions:z.array(question).min(1).max(8)}).strict();
export const homeworkSchema=z.object({homework:learningSchema.shape.homework.unwrap()}).strict();
export function activitySchema(mode:LearningMode) {
  if(mode==='explain')return explainSchema;
  if(mode==='summary')return summarySchema;
  if(mode==='essential')return essentialSchema;
  if(mode==='visual')return visualSchema;
  if(mode==='homework')return homeworkSchema;
  return revisionSchema;
}
export const isEvaluation=(mode:LearningMode)=>['quiz','gap','order','mix','homework'].includes(mode);
export const activityTitle=(mode:LearningMode)=>({explain:'Comprendre ton cours',summary:'Le résumé de ton cours',essential:'L’essentiel à retenir',visual:'Ton cours en visuel',homework:'Ton devoir, étape par étape'} as Record<string,string>)[mode]??'Réviser ton cours';
export type ValidationReport={totalBlocks:number;acceptedBlocks:number;rejectedBlocks:number;codes:LearningErrorCode[]};
export type ReportValidation=(report:ValidationReport)=>void;
const shell=(mode:LearningMode):LearningOutput=>({title:activityTitle(mode),blocks:[],questions:[],visual:null,homework:null});

// Only fields belonging to this activity are consumed. Unexpected legacy/model
// fields are discarded, never persisted or forwarded to the audit.
export function validateActivity(raw:unknown,passages:Passage[],mode:LearningMode,report?:ReportValidation):LearningOutput {
  const source=z.record(z.string(),z.unknown()).safeParse(raw);
  if(!source.success)throw new LearningFailure('INVALID_STRUCTURE');
  const allowed=Object.fromEntries(Object.keys(activitySchema(mode).shape).map(k=>[k,source.data[k]]));
  const owned=passages.filter(p=>p.quality==='verified'); // caller loads these through ownedCourse(userId, courseId)
  const output=shell(mode);
  if(isEvaluation(mode)) {
    const total=mode==='homework'?1:Array.isArray(allowed.questions)?allowed.questions.length:0;
    try {
    const parsed=activitySchema(mode).safeParse(allowed);
    if(!parsed.success)throw new LearningFailure('INVALID_STRUCTURE');
    Object.assign(output,parsed.data);
    const refs=output.homework?.citations??output.questions[0]?.citations;
    output.blocks=[{text:'Travaille une étape à la fois avec ton cours.',kind:'explanation',citations:refs??[]}];
    const validated=validateGroundedOutput(output,owned,mode);
    report?.({totalBlocks:total,acceptedBlocks:total,rejectedBlocks:0,codes:[]});
    return validated;
    } catch(error) {
      const failure=error instanceof LearningFailure?error:new LearningFailure('INVALID_STRUCTURE');
      report?.({totalBlocks:total,acceptedBlocks:0,rejectedBlocks:total,codes:[failure.code]});
      throw failure;
    }
  }
  if(!Array.isArray(allowed.blocks)&&mode!=='visual')throw new LearningFailure('INVALID_STRUCTURE');
  const rawBlocks=Array.isArray(allowed.blocks)?allowed.blocks:[allowed.blocks];
  const stats:ValidationReport={totalBlocks:rawBlocks.length,acceptedBlocks:0,rejectedBlocks:0,codes:[]};
  const reject=(error:unknown)=>{stats.rejectedBlocks++;const code=learningErrorCode(error);if(!stats.codes.includes(code))stats.codes.push(code);};
  const maximum=mode==='summary'?2:3;
  for(const rawBlock of rawBlocks) {
    try {
      const parsed=shortBlock.safeParse(rawBlock);
      if(!parsed.success||output.blocks.length>=maximum)throw new LearningFailure('INVALID_STRUCTURE');
      const candidate={...shell(mode),blocks:[parsed.data]};
      output.blocks.push(validateGroundedOutput(candidate,owned,'explain').blocks[0]);stats.acceptedBlocks++;
    } catch(error){reject(error);}
  }
  if(mode==='visual') {
    const envelope=z.object({type:visual.shape.type,title:visual.shape.title,items:z.array(z.unknown())}).safeParse(allowed.visual);
    if(envelope.success) {
      const items:NonNullable<LearningOutput['visual']>['items']=[];const remap=new Map<number,number>();
      envelope.data.items.forEach((item,index)=>{
        stats.totalBlocks++;
        try {
          const parsed=visual.shape.items.element.safeParse(item);
          if(!parsed.success||index>=10)throw new LearningFailure('INVALID_STRUCTURE');
          const value=parsed.data;
          if(value.parent>=index||value.parent>=0&&!remap.has(value.parent))throw new LearningFailure('INVALID_STRUCTURE');
          validateGroundedOutput({...shell(mode),blocks:[{text:value.label+' '+value.detail,kind:'explanation',citations:value.citations}]},owned,'explain');
          if(envelope.data.type==='timeline'&&!/\d/.test(value.label))throw new LearningFailure('UNVERIFIABLE_NUMBER');
          remap.set(index,items.length);items.push({...value,parent:value.parent<0?-1:remap.get(value.parent)!});stats.acceptedBlocks++;
        } catch(error){reject(error);}
      });
      // A single supported item remains useful; the persisted representation is
      // textual when a diagram no longer has two connected items.
      if(items.length>=2)output.visual={type:envelope.data.type,title:activityTitle(mode),items};
      else if(items.length===1)output.blocks.push({text:items[0].label+' : '+items[0].detail,kind:'explanation',citations:items[0].citations});
    } else {stats.totalBlocks++;reject(new LearningFailure('INVALID_STRUCTURE'));}
  }
  report?.(stats);
  if(!output.blocks.length&&!output.visual)throw new LearningFailure('NO_USABLE_BLOCKS');
  // Text alternative is built only from accepted items if all generated blocks failed.
  if(!output.blocks.length&&output.visual)output.blocks=output.visual.items.slice(0,3).map(i=>({text:i.label+' : '+i.detail,kind:'explanation',citations:i.citations}));
  output.elementsOmitted=stats.rejectedBlocks>0;
  return output;
}
