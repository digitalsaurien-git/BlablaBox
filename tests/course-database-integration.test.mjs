import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { disposableDatabaseUrl } from "./helpers/lot2-environment.mjs";
import { syntheticPdf } from "./helpers/source-fixtures.mjs";
import { importSource } from "../lib/sources/import.ts";
import * as storage from "../lib/sources/storage.ts";
import { createPart, updatePart, reorderParts, placeSource } from "../lib/courses/mutations.ts";

test("Lot 2 PostgreSQL : isolation SQL, transactions, concurrence et fichiers", { skip: process.env.LOT2_TEST_DATABASE_URL ? false : "LOT2_TEST_DATABASE_URL jetable non définie" }, async (t) => {
  const db = new PrismaClient({datasources:{db:{url:disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL)}}});
  const directory = await mkdtemp(path.join(tmpdir(),"blablabox-lot2-integration-"));
  const priorRoot=process.env.SOURCE_STORAGE_ROOT; process.env.SOURCE_STORAGE_ROOT=directory;
  const marker=randomUUID();
  const a=marker+"a", b=marker+"b";
  const input={userId:a,coursePartId:null,fileName:"original.pdf",declaredMime:"application/pdf",bytes:syntheticPdf("one")};
  let treeA, treeB, assetA;
  async function tree(userId) {
    const year=await db.schoolYear.create({data:{userId,label:"Year"}});
    const subject=await db.subject.create({data:{userId,schoolYearId:year.id,title:"Subject"}});
    const theme=await db.courseTheme.create({data:{userId,subjectId:subject.id,title:"Theme"}});
    const chapter=await db.chapter.create({data:{userId,courseThemeId:theme.id,title:"Chapter"}});
    const part=await createPart(db,userId,theme.id,0,{title:"Part",referenceLabel:"4.2",chapterId:chapter.id,state:"DOCUMENT_EXPECTED"});
    return {year,subject,theme,chapter,part};
  }
  try {
    await db.user.createMany({data:[{id:a,email:a+"@example.invalid",passwordHash:"synthetic"},{id:b,email:b+"@example.invalid",passwordHash:"synthetic"}]});
    treeA=await tree(a); treeB=await tree(b);
    await t.test("même contenu simultané : un original, deux traces, un seul rattachement",async()=>{
      const results=await Promise.all([importSource(db,{...input,coursePartId:treeA.part.id}),importSource(db,{...input,fileName:"renamed.pdf",coursePartId:treeA.part.id})]);
      assert.equal(results.filter(r=>r.duplicate).length,1);
      assert.equal(results[0].sourceAssetId,results[1].sourceAssetId); assetA=results[0].sourceAssetId;
      assert.equal(await db.sourceAsset.count({where:{userId:a}}),1);
      assert.equal(await db.sourceImport.count({where:{userId:a}}),2);
      assert.equal(await db.sourcePlacement.count({where:{userId:a}}),1);
      assert.equal((await readdir(directory)).length,1);
      assert.equal((await db.coursePart.findUniqueOrThrow({where:{id:treeA.part.id}})).state,"NORMAL");
    });
    await t.test("même nom différent et contenu identique d'un autre compte : originaux séparés",async()=>{
      await importSource(db,{...input,bytes:syntheticPdf("two")});
      const foreign=await importSource(db,{...input,userId:b});
      assert.equal(foreign.duplicate,false);
      assert.equal(await db.sourceAsset.count({where:{userId:{in:[a,b]}}}),3);
      assert.equal((await readdir(directory)).length,3);
    });
    await t.test("PostgreSQL refuse neuf relations incohérentes sans passer par les actions",async()=>{
      const sourceB=await db.sourceAsset.findFirstOrThrow({where:{userId:b}});
      await placeSource(db,b,sourceB.id,treeB.part.id);
      const placement=await db.sourcePlacement.findFirstOrThrow({where:{userId:b}});
      const trace=await db.sourceImport.findFirstOrThrow({where:{userId:b}});
      const other=await db.courseTheme.create({data:{userId:b,subjectId:treeB.subject.id,title:"Other theme"}});
      const probes=[
        ['Subject','schoolYearId',treeA.year.id,treeB.subject.id],
        ['CourseTheme','subjectId',treeA.subject.id,treeB.theme.id],
        ['Chapter','courseThemeId',treeA.theme.id,treeB.chapter.id],
        ['CoursePart','courseThemeId',treeA.theme.id,treeB.part.id],
        ['CoursePart','chapterId',treeA.chapter.id,treeB.part.id],
        ['SourceImport','sourceAssetId',assetA,trace.id],
        ['SourcePlacement','sourceAssetId',assetA,placement.id],
        ['SourcePlacement','coursePartId',treeA.part.id,placement.id],
      ];
      for (const [table,field,value,id] of probes) await assert.rejects(db.$executeRawUnsafe(`UPDATE "${table}" SET "${field}"=$1 WHERE id=$2`,value,id),e=>e.code==="P2010" && e.meta?.code==="23503");
      await assert.rejects(db.$executeRawUnsafe('UPDATE "CoursePart" SET "courseThemeId"=$1 WHERE id=$2',other.id,treeB.part.id),e=>e.meta?.code==="23503");
      assert.equal(await db.sourceAsset.count({where:{userId:{in:[a,b]}}}),3);
    });
    await t.test("échec de base ou de publication : aucune ligne ni fichier supplémentaire",async()=>{
      const files=await readdir(directory), rows=await db.sourceImport.count({where:{userId:{in:[a,b]}}});
      await assert.rejects(importSource(db,{...input,userId:"nonexistent-"+marker}));
      await assert.rejects(importSource(db,{...input,bytes:syntheticPdf("publish fail")},{...storage,finalizeSourceFile:async()=>{throw new Error("synthetic publication failure");}}));
      const failingCommit = { sourceAsset: db.sourceAsset, $transaction: (callback,options) => db.$transaction(async transaction => { await callback(transaction); throw new Error("synthetic rollback after publication"); },options) };
      await assert.rejects(importSource(failingCommit,{...input,bytes:syntheticPdf("after publish")}));
      assert.deepEqual(await readdir(directory),files);
      assert.equal(await db.sourceImport.count({where:{userId:{in:[a,b]}}}),rows);
    });
    await t.test("une collision de publication ne supprime pas le fichier préexistant",async()=>{
      const target=await storage.createSourceWriteTarget();
      await writeFile(target.finalPath,"existing-unreferenced-file",{flag:"wx"});
      try {
        await assert.rejects(importSource(db,{...input,bytes:syntheticPdf("collision")},{...storage,createSourceWriteTarget:async()=>target}));
        assert.equal(await readFile(target.finalPath,"utf8"),"existing-unreferenced-file");
        assert.equal(await db.sourceAsset.count({where:{storageKey:target.storageKey}}),0);
      } finally { await rm(target.finalPath,{force:true}); }
    });
    await t.test("réponse COMMIT perdue : conserver le fichier committé, puis reconnaître le doublon",async()=>{
      const uncertain={sourceAsset:db.sourceAsset,$transaction:async(callback,options)=>{await db.$transaction(callback,options);throw new Error("synthetic lost commit response");}};
      const retryInput={...input,bytes:syntheticPdf("uncertain commit")};
      await assert.rejects(importSource(uncertain,retryInput));
      const retry=await importSource(db,retryInput);
      assert.equal(retry.duplicate,true);
      const asset=await db.sourceAsset.findUniqueOrThrow({where:{id:retry.sourceAssetId}});
      assert.deepEqual(Buffer.from(await storage.readSourceFile(asset.storageKey)),retryInput.bytes);
      assert.equal(await db.sourceImport.count({where:{sourceAssetId:asset.id}}),2);
      await db.sourceAsset.delete({where:{id:asset.id}});
      await storage.removeSourceFile(asset.storageKey);
    });
    await t.test("base indisponible pendant la réconciliation : conserver l'orphelin sans temporaire",async()=>{
      const before=await readdir(directory);
      const unavailable={sourceAsset:{findUnique:async()=>{throw new Error("synthetic database unavailable");}},$transaction:(callback,options)=>db.$transaction(async tx=>{await callback(tx);throw new Error("synthetic rollback");},options)};
      await assert.rejects(importSource(unavailable,{...input,bytes:syntheticPdf("unavailable reconciliation")}));
      const extra=(await readdir(directory)).filter(name=>!before.includes(name));
      assert.equal(extra.length,1);assert.ok(!extra[0].endsWith(".tmp"));
      assert.equal(await db.sourceAsset.count({where:{storageKey:extra[0]}}),0);
      await storage.removeSourceFile(extra[0]);
    });
    await t.test("versions concurrentes : un seul gagnant, aucun écrasement d'ordre",async()=>{
      const fields={title:"Concurrent",referenceLabel:"4.10",chapterId:null,state:"NORMAL"};
      const results=await Promise.allSettled([createPart(db,a,treeA.theme.id,1,fields),createPart(db,a,treeA.theme.id,1,fields)]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      assert.equal(results.find(r=>r.status==="rejected").reason.message,"stale-order");
      await createPart(db,a,treeA.theme.id,2,{...fields,referenceLabel:"4.1"});
      const staleSnapshot=await db.coursePart.findMany({where:{userId:a},orderBy:{position:"asc"}});
      await assert.rejects(reorderParts(db,a,treeA.theme.id,2),/stale-order/);
      assert.deepEqual(await db.coursePart.findMany({where:{userId:a},orderBy:{position:"asc"}}),staleSnapshot);
      const sorting=await Promise.allSettled([reorderParts(db,a,treeA.theme.id,3),reorderParts(db,a,treeA.theme.id,3)]);
      assert.equal(sorting.filter(r=>r.status==="fulfilled").length,1);
      assert.deepEqual((await db.coursePart.findMany({where:{userId:a},orderBy:{position:"asc"}})).map(p=>p.referenceLabel),["4.1","4.2","4.10"]);
      await updatePart(db,a,treeA.part.id,4,{title:"Updated",referenceLabel:"4.20",chapterId:null});
      await assert.rejects(reorderParts(db,a,treeA.theme.id,4,{partId:treeA.part.id,direction:"up"}),/stale-order/);
      await assert.rejects(updatePart(db,b,treeA.part.id,5,{title:"Foreign",referenceLabel:null,chapterId:null}),/not-found/);
    });
    await t.test("la suppression d'une hiérarchie de test conserve les originaux",async()=>{
      await db.schoolYear.delete({where:{id:treeA.year.id}});
      assert.equal(await db.sourceAsset.count({where:{userId:a}}),2);
      assert.equal(await db.sourceImport.count({where:{userId:a}}),3);
      assert.equal(await db.sourcePlacement.count({where:{userId:a}}),0);
      assert.equal((await readdir(directory)).length,3);
      assert.equal((await readdir(directory)).filter(n=>n.endsWith(".tmp")).length,0);
    });
  } finally {
    await db.user.deleteMany({where:{id:{in:[a,b]}}});
    await db.$disconnect();
    if(priorRoot===undefined) delete process.env.SOURCE_STORAGE_ROOT; else process.env.SOURCE_STORAGE_ROOT=priorRoot;
    await rm(directory,{recursive:true,force:true});
  }
});
