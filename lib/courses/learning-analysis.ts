import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { readSourceFile } from '../sources/storage.ts';
import { readLearningDocument } from './document-reader.ts';
import { getOCRProvider } from '../providers/ocr/index.ts';
import { insufficient, type Passage } from './learning-contract.ts';
import { digest, splitPassages, claim, complete } from './learning-helpers.ts';
import { MSG_COURSE_READING_REQUIRED, MSG_READING_IN_PROGRESS, MSG_NOT_FOUND_COURSE, MSG_NOT_FOUND_PAGE } from '../messages.ts';

export const COURSE_READING_REQUIRED = MSG_COURSE_READING_REQUIRED;

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
  if(!course) throw new Error(MSG_NOT_FOUND_COURSE);
  return course;
}
export type Course=Awaited<ReturnType<typeof ownedCourse>>;

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

export async function analyzeCourse(db:PrismaClient,userId:string,courseId:string,consentedIds:string[]=[]) {
  const course=await ownedCourse(db,userId,courseId);
  if(consentedIds.length>5)throw new Error('Choisis au maximum cinq pages à la fois.');
  const assets=courseSources(course);
  const owned=new Set(assets.flatMap(a=>a.extractions.map(e=>e.id)));
  if(consentedIds.some(id=>!owned.has(id)))throw new Error('Page introuvable.');
  for(const asset of assets) {
    const selected=asset.extractions.filter(e=>consentedIds.includes(e.id));
    if(asset.extractions.some(e=>e.extractorVersion===EXTRACTOR) && !selected.length)continue;
    const units=await db.$transaction(async tx=>{
      const [lock]=await tx.$queryRaw<Array<{acquired:boolean}>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`course-reading:${userId}:${asset.id}`},0)) AS acquired`;
      if(!lock.acquired)throw new Error(MSG_READING_IN_PROGRESS);
      const cached=await tx.sourceExtraction.findFirst({where:{userId,sourceAssetId:asset.id,extractorVersion:EXTRACTOR,method:'native'}});
      if(cached && !selected.length)return [];
      const read=await readLearningDocument(await readSourceFile(asset.storageKey),asset.mimeType);
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
  if(!source || source.method!=='ocr' || !text.trim() || text.length>20000)throw new Error(MSG_NOT_FOUND_PAGE);
  return db.sourceExtraction.create({data:{userId,sourceAssetId:source.sourceAssetId,unitKey:source.unitKey,inputHash:source.inputHash,extractorVersion:`review-${randomUUID()}`,method:'reviewed',quality:'verified',text,passages:{create:splitPassages(text).map(p=>({...p,quality:'verified'}))}}});
}
