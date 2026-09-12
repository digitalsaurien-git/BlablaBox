import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {disposableDatabaseUrl} from './helpers/lot2-environment.mjs';
import {prepareLearning} from '../lib/courses/learning-service.ts';
import {evidenceContext} from '../lib/courses/evidence.ts';

test('preuves PostgreSQL : anciennes extractions sans fichier, isolation cours/comptes et citations multiples', {skip:!process.env.LOT2_TEST_DATABASE_URL?'Base jetable absente':false},async t=>{
  const db=new PrismaClient({datasources:{db:{url:disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL)}}});
  const ids=[randomUUID(),randomUUID()];
  for(const [key,value] of Object.entries({LLM_PROVIDER:'openai',LLM_API_KEY:'synthetic',OCR_PROVIDER:'disabled',TTS_PROVIDER:'disabled'})){
    const old=process.env[key];process.env[key]=value;t.after(()=>old===undefined?delete process.env[key]:process.env[key]=old);
  }
  const text='Cours : L’évolution humaine est progressive. Question : Quel fossile est ancien ? Réponse : Toumaï date de 7 Ma.';
  const fixtures=[];
  try {
    await db.user.createMany({data:ids.map(id=>({id,email:`${id}@example.invalid`,passwordHash:'synthetic'}))});
    for(const userId of [ids[0],ids[1],ids[0]]){
      const year=await db.schoolYear.create({data:{userId,label:randomUUID()}});
      const subject=await db.subject.create({data:{userId,schoolYearId:year.id,title:'Synthetic'}});
      const course=await db.courseTheme.create({data:{userId,subjectId:subject.id,title:'Synthetic'}});
      const part=await db.coursePart.create({data:{userId,courseThemeId:course.id,title:'Synthetic',position:0}});
      const asset=await db.sourceAsset.create({data:{userId,sha256:randomUUID().replaceAll('-','').repeat(2),storageKey:randomUUID(),mimeType:'application/pdf',byteSize:1}});
      await db.sourcePlacement.create({data:{userId,coursePartId:part.id,sourceAssetId:asset.id}});
      const e=await db.sourceExtraction.create({data:{userId,sourceAssetId:asset.id,unitKey:'page-1',inputHash:'a'.repeat(64),extractorVersion:'course-reader-1',method:'native',quality:'verified',text,passages:{create:{position:0,start:0,end:text.length,text,quality:'verified'}}},include:{passages:true}});
      await db.sourceExtraction.create({data:{userId,sourceAssetId:asset.id,unitKey:'page-2',inputHash:'b'.repeat(64),extractorVersion:'course-reader-1',method:'native',quality:'needs-vision',text:'PRIVATE_IMAGE_CANARY',passages:{create:{position:0,start:0,end:20,text:'PRIVATE_IMAGE_CANARY',quality:'uncertain'}}}});
      fixtures.push({course,e});
    }
    const before=await db.sourceExtraction.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'},include:{passages:true}});
    let calls=0;let foreign;
    t.mock.method(globalThis,'fetch',async(_url,options)=>{
      calls++;const payload=JSON.parse(JSON.parse(options.body).input);
      assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_IMAGE_CANARY/);
      const data=payload.segments?{blocks:foreign?[{text:'Synthetic',kind:'explanation',segmentIds:[foreign]}]:[
        ...payload.segments.map(e=>({text:e.text,kind:'explanation',segmentIds:[e.id]})),
        {text:'L’évolution est progressive et Toumaï date de 7 Ma.',kind:'explanation',segmentIds:payload.segments.map(e=>e.id)},
      ]}:{decisions:payload.elements.map(e=>({id:e.id,supported:true}))};
      return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]});
    });
    await assert.rejects(prepareLearning(db,ids[1],fixtures[0].course.id,'explain',5),/introuvable/);assert.equal(calls,0);
    const result=await prepareLearning(db,ids[0],fixtures[0].course.id,'explain',5);
    assert.equal(calls,2);
    const version=await db.projectVersion.findUniqueOrThrow({where:{id:result.versionId},include:{citations:true}});
    assert.equal(version.content.blocks.length,3);assert.equal(version.citations.length,4,'Both exact spans from one passage survive persistence');
    assert.match(version.content.blocks.map(b=>b.text).join(' '),/Toumaï.*7 Ma/);
    for(const ref of version.citations)assert.ok(text.includes(ref.quote));
    assert.equal((await prepareLearning(db,ids[0],fixtures[0].course.id,'explain',5)).versionId,result.versionId);assert.equal(calls,2);
    for(const other of fixtures.slice(1)){
      foreign=evidenceContext(other.e.passages.map(p=>({...p,label:'Synthetic',method:'native'}))).segments[0].id;
      await assert.rejects(prepareLearning(db,ids[0],fixtures[0].course.id,'summary',5),{code:'NO_USABLE_BLOCKS'});
    }
    assert.equal(calls,4);assert.equal(await db.projectVersion.count({where:{userId:{in:ids}}}),1);
    assert.equal(await db.providerUsage.count({where:{userId:{in:ids},operation:'ocr'}}),0);
    assert.deepEqual(await db.sourceExtraction.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'},include:{passages:true}}),before);
  } finally {await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
