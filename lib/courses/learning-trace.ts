import { randomUUID } from 'node:crypto';
import { LEARNING_ERROR_CODES, learningErrorCode, safeUsage, failureUsage, type TokenUsage } from './learning-errors.ts';
import { MODES, type LearningMode } from './learning-contract.ts';

const EVENTS=['action-start','generation-start','generation-end','validation-start','validation-end','audit-start','audit-end','coverage','transaction-start','done','failed'] as const;
type Event=typeof EVENTS[number];
type Metadata=TokenUsage & {totalBlocks?:number;acceptedBlocks?:number;rejectedBlocks?:number;errorCode?:string};
export type LearningTrace={event:(event:Event,metadata?:Metadata)=>void;failed:(error:unknown)=>void;activity?:(mode:LearningMode)=>void};

// Never serialize an Error or accept caller-provided identifiers/content.
// Correlation IDs are random and independent of accounts, documents and prompts.
export function createLearningTrace():LearningTrace {
  const traceId=randomUUID();const started=Date.now();let phase:Event='action-start';let activity:LearningMode|undefined;
  function emit(event:Event,metadata:Metadata={}) {
    if(!EVENTS.includes(event))return;
    const safe:Metadata=safeUsage(metadata);
    for(const key of ['totalBlocks','acceptedBlocks','rejectedBlocks'] as const)if(Number.isSafeInteger(metadata[key])&&metadata[key]!>=0&&metadata[key]!<=100)safe[key]=metadata[key];
    if(LEARNING_ERROR_CODES.some(c=>c===metadata.errorCode)||event==='coverage'&&metadata.errorCode==='LOW_EVIDENCE_COVERAGE')safe.errorCode=metadata.errorCode;
    console.info(JSON.stringify({scope:'course-learning',traceId,event,phase,durationMs:Math.max(0,Date.now()-started),...(activity?{activity}:{}),...safe}));
  }
  return {
    activity(mode){if(MODES.includes(mode))activity=mode;},
    event(event,metadata) {if(!EVENTS.includes(event))return;phase=event;emit(event,metadata);},
    failed(error) {
      emit('failed',{errorCode:learningErrorCode(error),...failureUsage(error)});
    },
  };
}
