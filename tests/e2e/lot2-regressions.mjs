import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { disposableDatabaseUrl } from "../helpers/lot2-environment.mjs";
const databaseUrl=disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL);
const state=JSON.parse(await readFile(process.env.LOT2_AUDIT_STATE,"utf8"));
assert.match(path.basename(state.root),/^blablabox-lot2-audit-[a-f0-9]+$/);
const session=JSON.parse(await readFile(path.join(state.root,"browser-session.json"),"utf8"));
const base=new URL(session.base);
assert.equal(base.hostname,"127.0.0.1");
const db=new PrismaClient({datasources:{db:{url:databaseUrl}}});
const audioRoot=path.join(state.root,"http-audio");
const name="synthetic-http-audio.mp3";
let project;
try {
  const common={sourceContent:"Synthetic regression",targetDurationMinutes:3,audience:"10-12 ans",tone:"calme",level:"simple",learningObjective:"Synthetic regression"};
  await db.project.upsert({where:{id:"legacy-null-owner"},create:{...common,id:"legacy-null-owner",title:"Projet historique sans propriétaire"},update:{}});
  const result=spawnSync(process.execPath,["tests/e2e/auth-http-scenario.mjs"],{encoding:"utf8",windowsHide:true,env:{...process.env,AUTH_TEST_DATABASE_URL:databaseUrl,AUTH_E2E_BASE_URL:base.origin}});
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0,"Régression HTTP Lot 1");
  const a=await db.user.findUniqueOrThrow({where:{email:session.email}});
  const b=await db.user.findFirstOrThrow({where:{email:session.email.replace("-a@example.invalid","-b@example.invalid")}});
  const cookie=session.cookies.map(([k,v])=>k+"="+v).join("; ");
  const page=await fetch(new URL("/projects/new",base),{headers:{Cookie:cookie}});
  assert.equal(page.status,200);
  const html=await page.text();
  const form=[...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1]).find(f=>f.includes("Generer le script"));
  assert.ok(form);
  const action=form.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];assert.ok(action);
  const body=new FormData();body.set(action,"");
  for(const [k,v] of Object.entries(common))body.set(k,String(v));
  const created=await fetch(new URL("/projects/new",base),{method:"POST",headers:{Cookie:cookie,Origin:base.origin},body,redirect:"manual"});
  assert.equal(created.status,303);
  const id=created.headers.get("location").split("/").at(-1);
  project=await db.project.findUniqueOrThrow({where:{id}});
  assert.equal(project.userId,a.id);assert.equal(project.scriptStatus,"SCRIPT_GENERATED");assert.ok(project.script);
  // A synthetic binary exercises existing playback/download transport; no TTS call.
  await mkdir(audioRoot,{recursive:true});
  const audio=Buffer.from([0x49,0x44,0x33,4,0,0,0,0,0,0,0xff,0xfb,0x90,0x64,...new Array(413).fill(0)]);
  await writeFile(path.join(audioRoot,name),audio,{flag:"wx"});
  await db.project.update({where:{id},data:{audioStatus:"GENERATED",audioContentVersion:project.contentVersion,audioFilePath:name,audioFormat:"mp3"}});
  for(const suffix of ["","?download=1"]) {
    const response=await fetch(new URL(`/api/projects/${id}/audio${suffix}`,base),{headers:{Cookie:cookie}});
    assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"audio/mpeg");
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.match(response.headers.get("content-disposition"),suffix?/attachment/:/inline/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),audio);
  }
  const loginPage=await fetch(new URL("/login",base));
  const loginHtml=await loginPage.text();
  const loginForm=[...loginHtml.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1]).find(f=>f.includes('name="email"'));
  const loginBody=new FormData();loginBody.set(loginForm.match(/name="(\$ACTION_ID_[^"]+)"/)[1],"");loginBody.set("email",b.email);loginBody.set("password",session.password);
  const login=await fetch(new URL("/login",base),{method:"POST",headers:{Origin:base.origin},body:loginBody,redirect:"manual"});
  assert.equal(login.status,303);
  const bCookie=login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  assert.equal((await fetch(new URL(`/api/projects/${id}/audio`,base),{headers:{Cookie:bCookie}})).status,404);
  assert.equal((await fetch(new URL(`/api/projects/${id}/audio`,base))).status,401);
  const report={authScenario:true,projectCreatedViaForm:true,mockScriptGenerated:true,audioInlineBytesMatch:true,audioDownloadBytesMatch:true,crossUserAudio404:true,anonymousAudio401:true,paidCalls:0,audibleQualityTested:false};
  await writeFile(path.join(state.root,"regressions-result.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  if(project)await db.project.deleteMany({where:{id:project.id}});
  await rm(path.join(audioRoot,name),{force:true});
  await db.$disconnect();
}
