import { Worker } from 'node:worker_threads';
import path from 'node:path';
export type DocumentUnit = { key:string; label:string; text:string; hash:string; needsVision:boolean; image?:string; mime?:string };
let activeReaders=0;
export async function readLearningDocument(bytes:Uint8Array, mime:string):Promise<DocumentUnit[]> {
  if(activeReaders>=2)throw new Error('Deux documents sont déjà en cours de lecture. Réessaie dans un instant.');
  activeReaders++;
  try {return await new Promise((resolve,reject) => {
    const worker = new Worker(path.join(process.cwd(),'lib/courses/document-worker.mjs'), {workerData:{bytes,mime},resourceLimits:{maxOldGenerationSizeMb:256}});
    const timer = setTimeout(() => {void worker.terminate();reject(new Error('La lecture du document a dépassé le délai autorisé.'));},30000);
    worker.once('message',(result:{units?:DocumentUnit[];error?:string})=>{clearTimeout(timer);void worker.terminate();if(result.units)resolve(result.units);else reject(new Error(result.error ?? 'Lecture impossible.'));});
    worker.once('error',()=>{clearTimeout(timer);reject(new Error('Lecture locale indisponible.'));});
    // Even a clean exit without a message must settle the promise. Rejecting
    // after the message resolved it is harmless; clearing the timer alone is not.
    worker.once('exit',()=>{clearTimeout(timer);reject(new Error('Lecture interrompue.'));});
  });} finally {activeReaders--;}
}
