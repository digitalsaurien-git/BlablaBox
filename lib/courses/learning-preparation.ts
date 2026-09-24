import type { PrismaClient } from '@prisma/client';
import { generateCourse, type Usage } from '../providers/llm/course-provider.ts';
import { insufficient, learningSchema, type LearningMode } from './learning-contract.ts';
import { ESSENTIAL_VERSION, EVIDENCE_VERSION, usesEvidence } from './evidence.ts';
import { QUIZ_VERSION } from './quiz-contract.ts';
import { LearningFailure, failureUsage, withUsage } from './learning-errors.ts';
import type { LearningTrace } from './learning-trace.ts';
import { digest, json, claim, complete } from './learning-helpers.ts';
import { ownedCourse, passageSnapshot, analyzeCourse, COURSE_READING_REQUIRED } from './learning-analysis.ts';

export async function prepareLearning(db:PrismaClient,userId:string,courseId:string,mode:LearningMode,minutes:5|10,instruction='',trace?:LearningTrace) {
  let course=await ownedCourse(db,userId,courseId);
  let snapshot=passageSnapshot(course);
  if(mode==='homework' && (!instruction.trim() || instruction.length>3000))throw new Error('Écris une consigne de 3 000 caractères maximum.');
  if(!snapshot.passages.some(p=>p.quality==='verified')) {
    await analyzeCourse(db,userId,courseId);
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
