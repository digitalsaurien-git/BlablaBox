import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { disposableDatabaseUrl } from './helpers/lot2-environment.mjs';
import { syntheticOdt, syntheticPdf } from './helpers/source-fixtures.mjs';
import { importSource } from '../lib/sources/import.ts';
import { analyzeCourse, prepareLearning, ownedCourse, passageSnapshot, answerSession, advanceSession, ownedSession, requestCorrection, prepareAudio, learningAudioText, reviewExtraction } from '../lib/courses/learning-service.ts';

test('PostgreSQL apprentissage : sources, consentement, cache, versions, activités et isolation', {skip:!process.env.LOT2_TEST_DATABASE_URL?'LOT2_TEST_DATABASE_URL jetable absente':false},async()=>{
  const db=new PrismaClient({datasources:{db:{url:disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL)}}});
  const directory=await mkdtemp(path.join(tmpdir(),'blablabox-learning-'));const old={};
  for(const name of ['SOURCE_STORAGE_ROOT','AUDIO_STORAGE_PATH','LLM_PROVIDER','OCR_PROVIDER','TTS_PROVIDER','TTS_API_KEY'])old[name]=process.env[name];
  process.env.SOURCE_STORAGE_ROOT=path.join(directory,'sources');process.env.AUDIO_STORAGE_PATH=path.join(directory,'audio');process.env.LLM_PROVIDER='mock';process.env.OCR_PROVIDER='mock';
  const marker=randomUUID();const ids=[marker+'a',marker+'b'];const previousFetch=global.fetch;
  try {
    await db.user.createMany({data:ids.map(id=>({id,email:`${id}@example.invalid`,passwordHash:'synthetic'}))});
    const year=await db.schoolYear.create({data:{userId:ids[0],label:marker}});const subject=await db.subject.create({data:{userId:ids[0],schoolYearId:year.id,title:'Sciences'}});
    const course=await db.courseTheme.create({data:{userId:ids[0],subjectId:subject.id,title:'Croissance synthétique'}});
    const parts=[];
    for(let i=0;i<3;i++)parts.push(await db.coursePart.create({data:{userId:ids[0],courseThemeId:course.id,title:`Partie ${i}`,position:i}}));
    const texts=['La germination est le début de la croissance. La graine devient une plante et développe ses racines.','La floraison est la formation des fleurs. Après la croissance des feuilles, les fleurs apparaissent.'];
    for(let i=0;i<2;i++)await importSource(db,{userId:ids[0],coursePartId:parts[i].id,fileName:`part-${i}.odt`,declaredMime:'application/vnd.oasis.opendocument.text',bytes:syntheticOdt(texts[i])});
    await importSource(db,{userId:ids[0],coursePartId:parts[2].id,fileName:'scan.pdf',declaredMime:'application/pdf',bytes:syntheticPdf('')});
    await assert.rejects(analyzeCourse(db,ids[1],course.id),/introuvable/);
    await analyzeCourse(db,ids[0],course.id);
    const count=await db.sourceExtraction.count({where:{userId:ids[0]}});assert.equal(count,3);
    assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'ocr'}}),0);
    await analyzeCourse(db,ids[0],course.id);assert.equal(await db.sourceExtraction.count({where:{userId:ids[0]}}),count);
    const pending=await db.sourceExtraction.findFirst({where:{userId:ids[0],quality:'needs-vision'}});assert.ok(pending);
    await assert.rejects(analyzeCourse(db,ids[0],course.id,['foreign']),/introuvable/);
    await analyzeCourse(db,ids[0],course.id,[pending.id]);await analyzeCourse(db,ids[0],course.id,[pending.id]);
    assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'ocr'}}),1);
    const ocr=await db.sourceExtraction.findFirst({where:{userId:ids[0],method:'ocr'}});assert.equal(ocr.quality,'uncertain');assert.ok(ocr.consentAt);
    const before=await ownedCourse(db,ids[0],course.id);assert.deepEqual(passageSnapshot(before).passages.slice(0,2).map(p=>p.text),texts);
    const explanation=await prepareLearning(db,ids[0],course.id,'explain',5);
    const again=await prepareLearning(db,ids[0],course.id,'explain',5);assert.equal(explanation.versionId,again.versionId);
    assert.equal(await db.project.count({where:{userId:ids[0]}}),1);
    const version=await db.projectVersion.findUniqueOrThrow({where:{id:explanation.versionId}});assert.equal(version.mode,'explain');
    await assert.rejects(prepareLearning(db,ids[1],course.id,'explain',5),/introuvable/);
    const citations=await db.passageCitation.findMany({where:{projectVersionId:version.id}});assert.ok(citations.length);
    await assert.rejects(db.passageCitation.create({data:{userId:ids[1],projectVersionId:version.id,passageId:citations[0].passageId,elementKey:'foreign',quote:'foreign'}}));
    const revision=await prepareLearning(db,ids[0],course.id,'mix',5);const session=await ownedSession(db,ids[0],revision.sessionId);
    const questions=session.projectVersion.content.questions;
    await assert.rejects(learningAudioText(db,ids[0],session.projectVersionId,'feedback-0',session.id),/d’abord/);
    await assert.rejects(ownedSession(db,ids[1],session.id),/introuvable/);
    await assert.rejects(advanceSession(db,ids[0],session.id),/d’abord/);
    for(let i=0;i<questions.length;i++) {
      await answerSession(db,ids[0],session.id,i,questions[i].expected.join('\n'));
      assert.ok((await learningAudioText(db,ids[0],session.projectVersionId,`feedback-${i}`,session.id)).text);
      await advanceSession(db,ids[0],session.id);
    }
    assert.equal((await ownedSession(db,ids[0],session.id)).position,questions.length);
    const hw=await prepareLearning(db,ids[0],course.id,'homework',5,'Explique la germination.');
    const first=await ownedSession(db,ids[0],hw.sessionId);assert.equal(first.correctionRequested,false);assert.equal(first.attempts.length,0);
    await assert.rejects(requestCorrection(db,ids[0],hw.sessionId),/tentative/);
    assert.equal((await ownedSession(db,ids[0],hw.sessionId)).correctionRequested,false);
    await assert.rejects(advanceSession(db,ids[0],hw.sessionId),/d’abord/);
    await answerSession(db,ids[0],hw.sessionId,0,'La germination fait pousser la plante.');await advanceSession(db,ids[0],hw.sessionId);
    assert.equal((await ownedSession(db,ids[0],hw.sessionId)).position,1);
    await requestCorrection(db,ids[0],hw.sessionId);assert.equal((await ownedSession(db,ids[0],hw.sessionId)).correctionRequested,true);
    let speechCalls=0;process.env.TTS_PROVIDER='openai';process.env.TTS_API_KEY='synthetic-test-key';
    global.fetch=async(url)=>{assert.equal(url,'https://api.openai.com/v1/audio/speech');speechCalls++;return new Response(new Uint8Array([73,68,51,1,2,3]));};
    await prepareAudio(db,ids[0],version.id,'content');await prepareAudio(db,ids[0],version.id,'content');assert.equal(speechCalls,1);
    await assert.rejects(prepareAudio(db,ids[1],version.id,'content'),/introuvable/);
    const audio=(await db.projectVersion.findUniqueOrThrow({where:{id:version.id}})).audio;assert.ok(audio.content.file);assert.equal((await readdir(path.join(directory,'audio'))).length,2);
    await reviewExtraction(db,ids[0],course.id,ocr.id,'Lecture confirmée de la page synthétique après vérification.');
    const updated=await prepareLearning(db,ids[0],course.id,'explain',5);assert.notEqual(updated.versionId,version.id);
    assert.deepEqual((await db.projectVersion.findUniqueOrThrow({where:{id:version.id}})).audio,audio);
    const usages=await db.providerUsage.findMany({where:{userId:ids[0]}});
    const serialized=JSON.stringify(usages);for(const secret of ['synthetic-test-key',texts[0],'Explique la germination.','La germination fait pousser'])assert.equal(serialized.includes(secret),false);
    for(const usage of usages)assert.deepEqual(Object.keys(usage).sort(),['id','userId','operationKey','provider','operation','status','inputTokens','outputTokens','units','durationMs','createdAt'].sort());
  } finally {
    global.fetch=previousFetch;await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
    for(const [name,value] of Object.entries(old)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});
  }
});
