import { randomUUID } from 'node:crypto';

const EVENTS=['action-start','generation-start','generation-end','audit-start','audit-end','transaction-start','done','failed'] as const;
type Event=typeof EVENTS[number];
export type LearningTrace={event:(event:Event)=>void;failed:(error:unknown)=>void};

// Never serialize an Error or accept caller-provided identifiers/content.
// Correlation IDs are random and independent of accounts, documents and prompts.
export function createLearningTrace():LearningTrace {
  const traceId=randomUUID();const started=Date.now();let phase:Event='action-start';
  function emit(event:Event,errorCode?:string) {
    if(!EVENTS.includes(event))return;
    console.info(JSON.stringify({scope:'course-learning',traceId,event,phase,durationMs:Math.max(0,Date.now()-started),...(errorCode?{errorCode}:{})}));
  }
  return {
    event(event) {if(!EVENTS.includes(event))return;phase=event;emit(event);},
    failed(error) {
      const message=error instanceof Error?error.message:'';
      const errorCode=/délai autorisé/.test(message)?'TIMEOUT':/configur/.test(message)?'PROVIDER_UNAVAILABLE':/déjà|interrompue/.test(message)?'BUSY':/introuvable/.test(message)?'NOT_FOUND':/vérifi|lecture|passage|cours|consigne/i.test(message)?'INPUT_UNUSABLE':'INTERNAL';
      emit('failed',errorCode);
    },
  };
}
