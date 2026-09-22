import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readSourceFile } from '../sources/storage.ts';
import { readLearningDocument } from './document-reader.ts';
import { getOCRProvider } from '../providers/ocr/index.ts';
import { generateCourse, type Usage } from '../providers/llm/course-provider.ts';
import { gradeQuestion, insufficient, learningSchema, type LearningMode, type Passage } from './learning-contract.ts';
import { generateSegmentedStoredAudio } from '../segmented-audio-generation.ts';
import { storedAudioExists } from '../audio-storage.ts';
import { getTTSProvider } from '../providers/tts/index.ts';
import type { LearningTrace } from './learning-trace.ts';
import { LearningFailure, failureUsage, withUsage } from './learning-errors.ts';
import { ESSENTIAL_VERSION, EVIDENCE_VERSION, usesEvidence } from './evidence.ts';
import { QUIZ_VERSION } from './quiz-contract.ts';

export const COURSE_READING_REQUIRED='Aucun passage vérifié n’est encore disponible pour travailler ce cours.';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const EXTRACTOR='course-reader-1';
export async function ownedCourse(db:PrismaClient,userId:string,id:string) {
  const course=await db.courseTheme.findFirst({
    where:{id,userId},
    include:{subject:true,parts:{
      orderBy:[{position:'asc'},{id:'asc'}],
      include:{placements:{
        orderBy:[{createdAt:'asc'},{id:'asc'}],
        include:{sourceAsset:{include:{
          imports:{orderBy:{createdAt:'asc'},take:1},
          extractions:{orderBy:[{createdAt:'asc'},{id:'asc'}],include:{passages:{orderBy:{position:'asc'}}}},
        }}},
      }},
    }},
  });
  if(!course) throw new Error('Cours introuvable.');
  return course;
}
type Course=Awaited<ReturnType<typeof ownedCourse>>;
export function courseSources(course:Course) {
  const seen=new Set<string>();
  return course.parts.flatMap(part=>part.placements.map(p=>p.sourceAsset)).filter(asset=>{if(seen.has(asset.id))return false;seen.add(asset.id);return true;});
}
export function passageSnapshot(course:Course):{passages:Passage[];fingerprint:string;pending:string[]} {
  const passages:Passage[]=[];const pending:string[]=[];
  const fingerprint:string[]=[course.id,String(course.orderVersion)];
  for(const asset of courseSources(course)) {
    const latest=new Map<string,typeof asset.extractions[number]>();
    for(const e of asset.extractions) latest.set(e.unitKey,e);
    if(!latest.size) pending.push(asset.id);
    fingerprint.push(asset.id,asset.sha256);
    for(const e of latest.values()) {
      fingerprint.push(e.id);
      if(e.quality==='needs-vision') pending.push(e.id);
      for(const p of e.passages) passages.push({id:p.id,text:p.text,quality:p.quality,method:e.method,label:`${asset.imports[0]?.originalFileName ?? 'Document'} · ${e.unitKey} · passage ${p.position+1}`});
    }
  }
  return {passages,fingerprint:digest(fingerprint.join('|')),pending};
}

export function splitPassages(text:string) {
  const results:Array<{position:number;start:number;end:number;text:string}>=[];
  let start=0;
  while(start<text.length) {
    let end=Math.min(start+1400,text.length);
    if(end<text.length) {const boundary=text.lastIndexOf(' ',end);if(boundary>start)end=boundary;}
    const segment=text.slice(start,end);
    if(segment.trim())results.push({position:results.length,start,end,text:segment});
    start=end;
    while(text[start]===' ') start++;
  }
  return results;
}
async function claim(db:PrismaClient,userId:string,operationKey:string,provider:string,operation:string) {
  try { return await db.providerUsage.create({data:{userId,operationKey,provider:provider.slice(0,30),operation,status:'PENDING'}}); }
  catch(error) {
    if(!(error && typeof error==='object' && 'code' in error && error.code==='P2002')) throw error;
    const changed=await db.providerUsage.updateMany({where:{userId,operationKey,status:'FAILED'},data:{status:'PENDING',createdAt:new Date()}});
    if(changed.count!==1)throw new Error('Cette préparation est déjà en cours ou terminée. Recharge la page. Une opération interrompue doit être vérifiée avant une nouvelle tentative.');
    return db.providerUsage.findUniqueOrThrow({where:{userId_operationKey:{userId,operationKey}}});
  }
}
async function complete(db:Pick<PrismaClient,'providerUsage'>,id:string,started:number,usage:Usage={},status='DONE') {
  const safeCount=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<2147483647?Number(n):null;
  await db.providerUsage.update({where:{id},data:{status,durationMs:Math.min(Date.now()-started,2147483647),inputTokens:safeCount(usage.inputTokens),outputTokens:safeCount(usage.outputTokens)}});
}

export async function analyzeCourse(db:PrismaClient,userId:string,courseId:string,consentedIds:string[]=[]) {
  const course=await ownedCourse(db,userId,courseId);
  if(consentedIds.length>5)throw new Error('Choisis au maximum cinq pages à la fois.');
  const assets=courseSources(course);
  const owned=new Set(assets.flatMap(a=>a.extractions.map(e=>e.id)));
  if(consentedIds.some(id=>!owned.has(id)))throw new Error('Page introuvable.');
  for(const asset of assets) {
    const selected=asset.extractions.filter(e=>consentedIds.includes(e.id));
    if(asset.extractions.some(e=>e.extractorVersion===EXTRACTOR) && !selected.length)continue;
    // Serialize the bounded native reader across processes. Contending clicks
    // get a recoverable message, never another extraction or an automatic retry.
    const units=await db.$transaction(async tx=>{
      const [lock]=await tx.$queryRaw<Array<{acquired:boolean}>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`course-reading:${userId}:${asset.id}`},0)) AS acquired`;
      if(!lock.acquired)throw new Error('La lecture est déjà en cours. Réessaie dans un instant.');
      const cached=await tx.sourceExtraction.findFirst({where:{userId,sourceAssetId:asset.id,extractorVersion:EXTRACTOR,method:'native'}});
      if(cached && !selected.length)return [];
      const read=await readLearningDocument(await readSourceFile(asset.storageKey),asset.mimeType);
      // Publish the entire document atomically; no partial extraction cache.
      if(!cached)for(const unit of read) {
        const quality=unit.needsVision?'needs-vision':unit.text.trim().length>=40?'verified':'uncertain';
        await tx.sourceExtraction.create({data:{userId,sourceAssetId:asset.id,unitKey:unit.key,inputHash:unit.hash,extractorVersion:EXTRACTOR,method:'native',quality,text:unit.text,passages:{create:splitPassages(unit.text).map(p=>({...p,quality:quality==='verified'?'verified':'uncertain'}))}}});
      }
      return read;
    },{timeout:40_000,maxWait:5_000});
    for(const unit of units) {
      const existing=asset.extractions.find(e=>e.unitKey===unit.key && e.inputHash===unit.hash && e.extractorVersion===EXTRACTOR);
      if(!unit.image || !existing || !selected.some(e=>e.id===existing.id)) continue;
      const already=await db.sourceExtraction.findFirst({where:{userId,sourceAssetId:asset.id,unitKey:unit.key,inputHash:unit.hash,method:{in:['ocr','reviewed']}}});
      if(already)continue;
      const provider=process.env.OCR_PROVIDER ?? 'disabled';
      const key=digest(`${asset.id}:${unit.key}:${unit.hash}:ocr`);
      const operation=await claim(db,userId,key,provider,'ocr');const started=Date.now();
      try {
        const result=await getOCRProvider().recognize({image:unit.image,mime:unit.mime ?? 'image/png',consent:true});
        if(!result.text.trim())throw new Error(insufficient);
        await db.$transaction(async tx=>{
          await tx.sourceExtraction.create({data:{userId,sourceAssetId:asset.id,unitKey:unit.key,inputHash:unit.hash,extractorVersion:EXTRACTOR,method:'ocr',quality:'uncertain',text:result.text,consentAt:new Date(),passages:{create:splitPassages(result.text).map(p=>({...p,quality:'uncertain'}))}}});
          await tx.providerUsage.update({where:{id:operation.id},data:{status:'DONE',durationMs:Date.now()-started}});
        });
        await complete(db,operation.id,started,result.usage);
      } catch(error) {await complete(db,operation.id,started,{},'FAILED');throw error;}
    }
  }
}

export async function reviewExtraction(db:PrismaClient,userId:string,courseId:string,extractionId:string,text:string) {
  const course=await ownedCourse(db,userId,courseId);
  const source=courseSources(course).flatMap(a=>a.extractions).find(e=>e.id===extractionId);
  if(!source || source.method!=='ocr' || !text.trim() || text.length>20000)throw new Error('Passage invalide.');
  return db.sourceExtraction.create({data:{userId,sourceAssetId:source.sourceAssetId,unitKey:source.unitKey,inputHash:source.inputHash,extractorVersion:`review-${randomUUID()}`,method:'reviewed',quality:'verified',text,passages:{create:splitPassages(text).map(p=>({...p,quality:'verified'}))}}});
}

export async function prepareLearning(db:PrismaClient,userId:string,courseId:string,mode:LearningMode,minutes:5|10,instruction='',trace?:LearningTrace) {
  let course=await ownedCourse(db,userId,courseId);
  let snapshot=passageSnapshot(course);
  if(mode==='homework' && (!instruction.trim() || instruction.length>3000))throw new Error('Écris une consigne de 3 000 caractères maximum.');
  if(!snapshot.passages.some(p=>p.quality==='verified')) {
    await analyzeCourse(db,userId,courseId); // Local only: never passes OCR consent.
    course=await ownedCourse(db,userId,courseId);snapshot=passageSnapshot(course);
  }
  const evaluation=['quiz','gap','order','mix','homework'].includes(mode);
  const passages=snapshot.passages.filter(p=>p.quality==='verified');
  if(!passages.length)throw new Error(COURSE_READING_REQUIRED);
  if(passages.reduce((n,p)=>n+p.text.length,0)>60000)throw new LearningFailure('SOURCE_UNUSABLE');
  const evidenceVersion=mode==='quiz'?QUIZ_VERSION:mode==='essential'?ESSENTIAL_VERSION:usesEvidence(mode)?EVIDENCE_VERSION:'learning-v1';
  const key=digest(JSON.stringify([courseId,snapshot.fingerprint,...(['essential','quiz','memo','flashcards'].includes(mode)?[course.subject.title]:[]),mode,minutes,instruction,process.env.LLM_PROVIDER ?? 'mock',process.env.LLM_MODEL ?? 'gpt-5-mini',evidenceVersion]));
  let version=await db.projectVersion.findUnique({where:{userId_cacheKey:{userId,cacheKey:key}}});
  if(!version) {
    const operation=await claim(db,userId,key,process.env.LLM_PROVIDER ?? 'mock','learning');const started=Date.now();
    let receivedUsage:Usage={};
    try {
      const result=await generateCourse({mode,minutes,instruction,passages,subject:course.subject.title},trace);
      receivedUsage=result.usage;
      trace?.event('transaction-start');
      version=await db.$transaction(async tx=>{
        const project=await tx.project.create({data:{userId,courseThemeId:courseId,title:course.title,sourceContent:passages.map(p=>p.text).join('\n\n'),targetDurationMinutes:minutes,audience:'10-12 ans',tone:'Clair',level:'Simple',learningObjective:'Travailler ce cours',projectKind:'COURSE_LEARNING',researchMode:'NONE',researchUsed:false,script:result.data.blocks.map(b=>b.text).join('\n\n'),scriptStatus:'SCRIPT_GENERATED'}});
        const created=await tx.projectVersion.create({data:{userId,projectId:project.id,courseThemeId:courseId,version:1,mode,sourceFingerprint:snapshot.fingerprint,cacheKey:key,content:json(result.data)}});
        const citations:Array<{elementKey:string;passageId:string;quote:string}>=[];
        const add=(elementKey:string,refs:Array<{passageId:string;quote:string}>)=>{refs.forEach((ref,i)=>citations.push({elementKey:`${elementKey}-ref-${i}`,...ref}));};
        result.data.blocks.forEach((b,i)=>add(`block-${i}`,b.citations));
        result.data.questions.forEach((q,i)=>add(`question-${i}`,q.citations));
        result.data.visual?.items.forEach((v,i)=>add(`visual-${i}`,v.citations));
        if(result.data.homework) {
          add('homework',result.data.homework.citations);
          result.data.homework.hints.forEach((b,i)=>add(`hint-${i}`,b.citations));
          result.data.homework.correction.forEach((b,i)=>add(`correction-${i}`,b.citations));
        }
        // Foreign passage IDs cannot survive either this check or the composite FK.
        if(citations.some(c=>!passages.some(p=>p.id===c.passageId && p.text.includes(c.quote))))throw new Error(insufficient);
        await tx.passageCitation.createMany({data:citations.map(c=>({...c,userId,projectVersionId:created.id}))});
        await complete(tx,operation.id,started,result.usage);
        return created;
      });
    } catch(error) {
      const failure=withUsage(error,{...receivedUsage,...failureUsage(error)});
      await complete(db,operation.id,started,failureUsage(failure),'FAILED');throw failure;
    }
  }
  if(evaluation) {
    const session=await db.learningSession.create({data:{userId,courseThemeId:courseId,projectVersionId:version.id,kind:mode==='homework'?'homework':'revision',instruction:mode==='homework'?instruction:null}});
    return {versionId:version.id,sessionId:session.id};
  }
  return {versionId:version.id,sessionId:null};
}

export async function ownedSession(db:PrismaClient,userId:string,id:string) {
  const session=await db.learningSession.findFirst({where:{id,userId},include:{projectVersion:true,attempts:{orderBy:{createdAt:'asc'}}}});
  if(!session)throw new Error('Activité introuvable.');
  return session;
}
export async function answerSession(db:PrismaClient,userId:string,id:string,position:number,answer:string) {
  const session=await ownedSession(db,userId,id);
  if(position!==session.position || !answer.trim() || answer.length>3000)throw new Error('Réponse invalide ou question déjà passée.');
  const output=learningSchema.parse(session.projectVersion.content);
  const q=output.questions[position];
  let correct:boolean|null=null;let feedback=insufficient;
  if(session.kind==='revision') {if(!q)throw new Error('Question introuvable.');correct=gradeQuestion(q,answer);feedback=q.explanation;}
  else {
    const h=output.homework;if(!h)throw new Error('Devoir introuvable.');
    const found=h.keywords.filter(k=>answer.toLocaleLowerCase('fr').includes(k.toLocaleLowerCase('fr')));
    // No model grades a free answer as true solely because keywords appear.
    feedback=found.length?`Tu as utilisé ${found.length} repère${found.length>1?'s':''} du cours. Vérifie maintenant le lien avec la consigne : ${h.check}`:`Cherche le premier repère dans le passage indiqué, puis complète ta réponse. ${h.check}`;
  }
  return db.learningAttempt.create({data:{userId,sessionId:id,questionIndex:position,answer,feedback,correct,hintsUsed:session.kind==='homework'?Math.min(session.position+1,2):0}});
}
export async function advanceSession(db:PrismaClient,userId:string,id:string) {
  const s=await ownedSession(db,userId,id);
  if(!s.attempts.some(a=>a.questionIndex===s.position))throw new Error('Réponds d’abord à cette question.');
  const output=learningSchema.parse(s.projectVersion.content);
  const maximum=s.kind==='revision'?output.questions.length:1;
  if(s.position>=maximum)return;
  await db.learningSession.updateMany({where:{id,userId,position:s.position},data:{position:{increment:1}}});
}
export async function requestCorrection(db:PrismaClient,userId:string,id:string) {
  const s=await ownedSession(db,userId,id);
  if(s.kind!=='homework')throw new Error('Devoir introuvable.');
  if(!s.attempts.length)throw new Error('Écris d’abord une tentative avant de voir la correction.');
  await db.learningSession.updateMany({where:{id,userId},data:{correctionRequested:true}});
}

export async function learningAudioText(db:PrismaClient,userId:string,versionId:string,key:string,sessionId?:string) {
  const version=await db.projectVersion.findFirst({where:{id:versionId,userId}});
  if(!version)throw new Error('Contenu introuvable.');
  const output=learningSchema.parse(version.content);
  if(key==='content' && !['quiz','gap','order','mix','homework'].includes(version.mode))return {version,text:output.blocks.map(b=>b.text).join('\n\n')};
  if(!sessionId)throw new Error('Activité requise.');
  const session=await ownedSession(db,userId,sessionId);
  if(session.projectVersionId!==versionId)throw new Error('Activité introuvable.');
  const match=key.match(/^(question|feedback)-(\d+)$/);
  if(!match)throw new Error('Audio introuvable.');
  const index=Number(match[2]);const q=output.questions[index];
  if(!q || index>session.position || session.kind!=='revision')throw new Error('Question introuvable.');
  if(match[1]==='feedback' && !session.attempts.some(a=>a.questionIndex===index))throw new Error('Réponds d’abord à cette question.');
  return {version,text:match[1]==='question'?[q.prompt,...q.choices].join('\n'):q.explanation};
}
export async function prepareAudio(db:PrismaClient,userId:string,versionId:string,key:string,sessionId?:string) {
  const {version,text}=await learningAudioText(db,userId,versionId,key,sessionId);
  const cacheKey=digest(JSON.stringify([text,process.env.TTS_PROVIDER,process.env.TTS_MODEL,process.env.TTS_VOICE]));
  const audio=version.audio as Record<string,{file:string;hash:string}>;
  if(audio[key]?.hash===cacheKey && await storedAudioExists(audio[key].file))return;
  const operation=await claim(db,userId,digest(`${versionId}:${key}:${cacheKey}`),process.env.TTS_PROVIDER ?? 'disabled','tts');const started=Date.now();
  try {
    await generateSegmentedStoredAudio({script:text,provider:getTTSProvider(),publish:async publication=>{
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId},0))::text`;
        const current=await tx.projectVersion.findFirst({where:{id:versionId,userId}});
        if(!current)throw new Error('Contenu introuvable.');
        await tx.projectVersion.update({where:{id:versionId},data:{audio:json({...current.audio as object,[key]:{file:publication.manifestFileName,hash:cacheKey}})}});
        await tx.providerUsage.update({where:{id:operation.id},data:{status:'DONE',durationMs:Date.now()-started}});
      });return true;
    }});
  } catch(error) {await complete(db,operation.id,started,{},'FAILED');throw error;}
}
