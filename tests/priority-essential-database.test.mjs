import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {disposableDatabaseUrl} from './helpers/lot2-environment.mjs';
import {prepareLearning} from '../lib/courses/learning-service.ts';
import {essentialPlan} from '../lib/courses/essential-plan.ts';

test('ancres PostgreSQL : tableau existant, priorité persistée, audit et isolation cours/comptes', {skip:!process.env.LOT2_TEST_DATABASE_URL?'Base jetable absente':false},async t=>{
  const db=new PrismaClient({datasources:{db:{url:disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL)}}});
  const ids=[randomUUID(),randomUUID()];
  for(const [key,value] of Object.entries({LLM_PROVIDER:'openai',LLM_API_KEY:'synthetic',OCR_PROVIDER:'disabled',TTS_PROVIDER:'disabled'})) {
    const old=process.env[key];process.env[key]=value;t.after(()=>old===undefined?delete process.env[key]:process.env[key]=old);
  }
  const text='Quels noms portent les anciens parents de l’homme ? Quand ont-ils vécu ? Compétence : savoir remplir un tableau. espèces Toumai Dates 7 Ma. Cours : Le berceau se situe en Afrique. La sécheresse entraîne une migration.';
  const fixtures=[];
  try {
    await db.user.createMany({data:ids.map(id=>({id,email:`${id}@example.invalid`,passwordHash:'synthetic'}))});
    for(const userId of [ids[0],ids[1],ids[0]]) {
      const year=await db.schoolYear.create({data:{userId,label:randomUUID()}});
      const subject=await db.subject.create({data:{userId,schoolYearId:year.id,title:'Histoire'}});
      const course=await db.courseTheme.create({data:{userId,subjectId:subject.id,title:'Synthetic anchors'}});
      const part=await db.coursePart.create({data:{userId,courseThemeId:course.id,title:'Synthetic',position:0}});
      const asset=await db.sourceAsset.create({data:{userId,sha256:randomUUID().replaceAll('-','').repeat(2),storageKey:randomUUID(),mimeType:'application/pdf',byteSize:1}});
      await db.sourcePlacement.create({data:{userId,coursePartId:part.id,sourceAssetId:asset.id}});
      const extraction=await db.sourceExtraction.create({data:{userId,sourceAssetId:asset.id,unitKey:'page-1',inputHash:'a'.repeat(64),extractorVersion:'course-reader-1',method:'native',quality:'verified',text,passages:{create:{position:0,start:0,end:text.length,text,quality:'verified'}}},include:{passages:true}});
      fixtures.push({course,extraction});
    }
    const before=await db.sourceExtraction.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'},include:{passages:true}});
    let foreign;let calls=0;const target=fixtures[0].course;
    t.mock.method(globalThis,'fetch',async(_url,options)=>{
      calls++;const payload=JSON.parse(JSON.parse(options.body).input);
      const data=payload.cardSlots?{blocks:payload.cardSlots.map((slot,index)=>({slotId:slot.id,title:index===0?'Toumaï : 7 Ma':index===1?'Origine africaine':'Conséquence',text:payload.segments.find(segment=>segment.id===slot.segmentId).text,kind:'explanation',segmentIds:[foreign??slot.segmentId]}))}:{decisions:payload.elements.map(element=>({id:element.id,supported:true}))};
      return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]});
    });
    await assert.rejects(prepareLearning(db,ids[1],target.id,'essential',5),/introuvable/);assert.equal(calls,0);
    for(const other of fixtures.slice(1)) {
      foreign=essentialPlan(other.extraction.passages.map(p=>({...p,label:'Synthetic',method:'native'})),'Histoire').slots[0].segmentId;
      await assert.rejects(prepareLearning(db,ids[0],target.id,'essential',5),{code:'UNKNOWN_CITATION'});
      assert.equal(await db.projectVersion.count({where:{userId:{in:ids}}}),0);
    }
    foreign=undefined;
    const result=await prepareLearning(db,ids[0],target.id,'essential',5);assert.equal(calls,4,'deux refus, une génération et un audit simulés');
    const version=await db.projectVersion.findUniqueOrThrow({where:{id:result.versionId},include:{citations:true}});
    assert.equal(version.content.blocks.length,3);assert.equal(version.content.blocks[0].title,'Toumaï : 7 Ma');
    assert.equal(version.content.blocks[0].citations[0].quote,'espèces Toumai Dates 7 Ma.');
    assert.doesNotMatch(JSON.stringify(version.content),/slotId|requiredTerms|requiredValue/);
    assert.equal((await prepareLearning(db,ids[0],target.id,'essential',5)).versionId,result.versionId);assert.equal(calls,4);
    assert.equal(await db.providerUsage.count({where:{userId:{in:ids},operation:'ocr'}}),0);
    assert.deepEqual(await db.sourceExtraction.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'},include:{passages:true}}),before);
  } finally {await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
