import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { disposableDatabaseUrl } from './helpers/lot2-environment.mjs';
import { syntheticOdt } from './helpers/source-fixtures.mjs';
import { importSource } from '../lib/sources/import.ts';
import { analyzeCourse, prepareLearning, ownedCourse, passageSnapshot, ownedSession, answerSession, advanceSession, learningAudioText } from '../lib/courses/learning-service.ts';
import { quizContext } from '../lib/courses/quiz-contract.ts';
import { quizFixture } from './helpers/quiz-fixtures.mjs';

test('PostgreSQL QCM : deux appels simulés, cache, réponses serveur, quatre étapes et isolation', {skip:!process.env.LOT2_TEST_DATABASE_URL?'Base jetable absente':false},async t=>{
  const db=new PrismaClient({datasources:{db:{url:disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL)}}});
  const directory=await mkdtemp(path.join(tmpdir(),'blablabox-quiz-db-'));
  const ids=[randomUUID(),randomUUID()],old={};
  for(const key of ['SOURCE_STORAGE_ROOT','LLM_PROVIDER','LLM_API_KEY','LLM_MODEL'])old[key]=process.env[key];
  Object.assign(process.env,{SOURCE_STORAGE_ROOT:directory,LLM_PROVIDER:'openai',LLM_API_KEY:'synthetic-never-sent',LLM_MODEL:'gpt-5-mini'});
  let calls=0;const f=quizFixture('Mathématiques');
  try {
    await db.user.createMany({data:ids.map(id=>({id,email:`${id}@example.invalid`,passwordHash:'synthetic'}))});
    const year=await db.schoolYear.create({data:{userId:ids[0],label:randomUUID()}});
    const subject=await db.subject.create({data:{userId:ids[0],schoolYearId:year.id,title:'Mathématiques'}});
    const course=await db.courseTheme.create({data:{userId:ids[0],subjectId:subject.id,title:'QCM synthétique'}});
    const part=await db.coursePart.create({data:{userId:ids[0],courseThemeId:course.id,title:'Exemple',position:0}});
    for(const [index,passage] of f.passages.entries())await importSource(db,{userId:ids[0],coursePartId:part.id,fileName:`synthetic-quiz-${index}.odt`,declaredMime:'application/vnd.oasis.opendocument.text',bytes:syntheticOdt(passage.text+' Cours : Ce document est un exemple synthétique de contrôle.')} );
    await analyzeCourse(db,ids[0],course.id);
    const passages=passageSnapshot(await ownedCourse(db,ids[0],course.id)).passages;
    const context=quizContext(passages,5,'Mathématiques');const raw=structuredClone(f.raw);
    raw.questions.forEach(q=>{const segment=context.context.segments.find(s=>s.text===q.explanation);assert.ok(segment,JSON.stringify({syntheticExpected:q.explanation,syntheticSegments:context.context.segments.map(s=>s.text)}));q.segmentIds=[segment.id];});
    t.mock.method(globalThis,'fetch',async()=>{calls++;assert.ok(calls<=2);return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(calls===1?raw:f.audit)}]}],usage:{input_tokens:25,output_tokens:35}});});
    await assert.rejects(prepareLearning(db,ids[1],course.id,'quiz',5),/introuvable/);assert.equal(calls,0);
    const prepared=await prepareLearning(db,ids[0],course.id,'quiz',5);
    const cached=await prepareLearning(db,ids[0],course.id,'quiz',5);assert.equal(cached.versionId,prepared.versionId);assert.equal(calls,2);
    const session=await ownedSession(db,ids[0],prepared.sessionId);assert.equal(session.projectVersion.content.questions.length,4);
    for(const run of [()=>ownedSession(db,ids[1],session.id),()=>answerSession(db,ids[1],session.id,0,'12 cm'),()=>advanceSession(db,ids[1],session.id),()=>learningAudioText(db,ids[1],session.projectVersionId,'feedback-0',session.id)])await assert.rejects(run,/introuvable/);
    await assert.rejects(learningAudioText(db,ids[0],session.projectVersionId,'feedback-0',session.id),/d’abord/);
    await assert.rejects(advanceSession(db,ids[0],session.id),/d’abord/);
    for(let index=0;index<4;index++) {
      const q=session.projectVersion.content.questions[index],correct=index%2===0;
      const attempt=await answerSession(db,ids[0],session.id,index,correct?q.expected[0]:q.choices.find(c=>c!==q.expected[0]));
      assert.equal(attempt.correct,correct);assert.equal(attempt.feedback,q.explanation);
      await advanceSession(db,ids[0],session.id);
      await assert.rejects(answerSession(db,ids[0],session.id,index,q.expected[0]),/déjà passée/);
    }
    assert.equal((await ownedSession(db,ids[0],session.id)).position,4);assert.equal(calls,2);
    const usage=await db.providerUsage.findFirstOrThrow({where:{userId:ids[0],operation:'learning'}});
    assert.equal(usage.status,'DONE');assert.equal(usage.inputTokens,50);assert.equal(usage.outputTokens,70);
    for(const value of ['synthetic-never-sent',...f.passages.map(p=>p.text),'12 cm'])assert.equal(JSON.stringify(usage).includes(value),false);
    assert.equal(await db.providerUsage.count({where:{userId:ids[1]}}),0);
    const refs=await db.passageCitation.findMany({where:{projectVersionId:session.projectVersionId}});
    for(const ref of refs){assert.equal(ref.userId,ids[0]);assert.ok(passages.some(p=>p.id===ref.passageId&&p.text.includes(ref.quote)));}
  } finally {
    await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
    for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});
  }
});
