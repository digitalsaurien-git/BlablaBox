import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { disposableDatabaseUrl } from './helpers/lot2-environment.mjs';
import { syntheticOdt, syntheticPdf } from './helpers/source-fixtures.mjs';
import { importSource } from '../lib/sources/import.ts';
import { analyzeCourse, COURSE_READING_REQUIRED, prepareLearning } from '../lib/courses/learning-service.ts';
import { LLM_TIMEOUT_MESSAGE, mockCourse } from '../lib/providers/llm/course-provider.ts';

test('préparation automatique : concurrence, cache, pages images, refus et isolation PostgreSQL', {skip:!process.env.LOT2_TEST_DATABASE_URL?'Base jetable absente':false},async t=>{
  const db=new PrismaClient({datasources:{db:{url:disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL)}}});
  const directory=await mkdtemp(path.join(tmpdir(),'blablabox-submit-ux-'));
  const env={};for(const key of ['SOURCE_STORAGE_ROOT','LLM_PROVIDER','LLM_API_KEY','OCR_PROVIDER'])env[key]=process.env[key];
  process.env.SOURCE_STORAGE_ROOT=directory;process.env.LLM_PROVIDER='mock';process.env.OCR_PROVIDER='openai';
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Real network forbidden');});
  const ids=[randomUUID(),randomUUID()];
  try {
    await db.user.createMany({data:ids.map(id=>({id,email:`${id}@example.invalid`,passwordHash:'synthetic'}))});
    const year=await db.schoolYear.create({data:{userId:ids[0],label:randomUUID()}});
    const subject=await db.subject.create({data:{userId:ids[0],schoolYearId:year.id,title:'Synthétique'}});
    async function courseWith(documents) {
      const course=await db.courseTheme.create({data:{userId:ids[0],subjectId:subject.id,title:randomUUID()}});
      for(const [position,document] of documents.entries()) {
        const part=await db.coursePart.create({data:{userId:ids[0],courseThemeId:course.id,position,title:`Synthétique ${position}`}});
        const imported=await importSource(db,{userId:ids[0],coursePartId:part.id,...document});
        if(imported.duplicate)await db.sourcePlacement.create({data:{userId:ids[0],coursePartId:part.id,sourceAssetId:imported.sourceAssetId}});
      }
      return course;
    }
    const scan={fileName:'synthetic-scan.pdf',declaredMime:'application/pdf',bytes:syntheticPdf('')};
    const text={fileName:'synthetic.odt',declaredMime:'application/vnd.oasis.opendocument.text',bytes:syntheticOdt('La germination est le début de la croissance. La plante développe ensuite ses premières feuilles.')};
    const course=await courseWith([text,scan]);
    await assert.rejects(prepareLearning(db,ids[1],course.id,'explain',5),/introuvable/);
    assert.equal(await db.sourceExtraction.count({where:{userId:ids[0]}}),0);
    const results=await Promise.allSettled([prepareLearning(db,ids[0],course.id,'explain',5),prepareLearning(db,ids[0],course.id,'explain',5)]);
    assert.ok(results.some(r=>r.status==='fulfilled'));
    for(const r of results)if(r.status==='rejected')assert.match(r.reason.message,/déjà/);
    const originals=await db.sourceExtraction.findMany({where:{userId:ids[0]},orderBy:{id:'asc'}});
    assert.equal(originals.length,2);assert.ok(originals.some(e=>e.quality==='needs-vision'));
    assert.equal(await db.projectVersion.count({where:{userId:ids[0]}}),1);
    assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'learning'}}),1);
    // A cached analysis must not even reopen source files.
    process.env.SOURCE_STORAGE_ROOT=path.join(directory,'nonexistent');
    await prepareLearning(db,ids[0],course.id,'explain',5);
    await prepareLearning(db,ids[0],course.id,'quiz',5);
    await prepareLearning(db,ids[0],course.id,'homework',5,'Explique la germination.');
    await analyzeCourse(db,ids[0],course.id);
    assert.deepEqual(await db.sourceExtraction.findMany({where:{userId:ids[0]},orderBy:{id:'asc'}}),originals);
    process.env.SOURCE_STORAGE_ROOT=directory;
    const imageOnly=await courseWith([scan]);
    for(const mode of ['explain','quiz','homework'])await assert.rejects(prepareLearning(db,ids[0],imageOnly.id,mode,5,'Consigne synthétique'),{message:COURSE_READING_REQUIRED});
    assert.equal(await db.projectVersion.count({where:{courseThemeId:imageOnly.id}}),0);
    assert.equal(await db.learningSession.count({where:{courseThemeId:imageOnly.id}}),0);
    assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'ocr'}}),0);
    assert.equal(calls,0);
    assert.equal(await db.sourceExtraction.count({where:{userId:ids[1]}}),0);
    // A received response rejected by validation must retain its counters only.
    process.env.LLM_PROVIDER='openai';process.env.LLM_API_KEY='synthetic';
    t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({blocks:[{text:'9999 jours.',kind:'explanation',citations:[{passageId:'foreign-account',quote:'synthetic'}]}]})}]}],usage:{input_tokens:111,output_tokens:222}});});
    await assert.rejects(prepareLearning(db,ids[0],course.id,'explain',5),{code:'NO_USABLE_BLOCKS'});
    assert.equal(calls,1);
    const failedUsage=await db.providerUsage.findFirst({where:{userId:ids[0],provider:'openai',status:'FAILED'}});
    assert.equal(failedUsage.inputTokens,111);assert.equal(failedUsage.outputTokens,222);
    assert.equal(await db.projectVersion.count({where:{userId:ids[0],mode:'explain'}}),1,'only the earlier mock version');
    assert.equal(await db.providerUsage.count({where:{userId:ids[1]}}),0);
    calls=0;
    // A timed-out audit must not publish the completed generation or a session.
    const controller=new AbortController();process.env.LLM_PROVIDER='openai';process.env.LLM_API_KEY='synthetic';
    t.mock.method(AbortSignal,'timeout',()=>controller.signal);
    t.mock.method(globalThis,'fetch',async(_url,options)=>{
      calls++;
      if(calls===1){const generated=mockCourse(JSON.parse(JSON.parse(options.body).input));return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(generated)}]}]});}
      return {ok:true,json:()=>{queueMicrotask(()=>controller.abort(new DOMException('synthetic','TimeoutError')));return new Promise(()=>{});}};
    });
    const before={versions:await db.projectVersion.count({where:{userId:ids[0]}}),projects:await db.project.count({where:{userId:ids[0]}}),sessions:await db.learningSession.count({where:{userId:ids[0]}})};
    await assert.rejects(prepareLearning(db,ids[0],course.id,'quiz',10),{message:LLM_TIMEOUT_MESSAGE});
    assert.equal(calls,2);
    assert.equal(await db.projectVersion.count({where:{userId:ids[0]}}),before.versions);
    assert.equal(await db.project.count({where:{userId:ids[0]}}),before.projects);
    assert.equal(await db.learningSession.count({where:{userId:ids[0]}}),before.sessions);
    assert.equal(await db.providerUsage.count({where:{userId:ids[0],provider:'openai',status:'FAILED'}}),2);
    assert.equal(await db.providerUsage.count({where:{userId:ids[0],status:'PENDING'}}),0);
  } finally {
    await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
    for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});
  }
});
