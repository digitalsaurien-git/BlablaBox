import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { disposableDatabaseUrl } from "../helpers/lot2-environment.mjs";
import { syntheticPdf, syntheticOdt } from "../helpers/source-fixtures.mjs";

const base = new URL(process.env.LOT2_E2E_BASE_URL);
assert.equal(base.hostname,"127.0.0.1");
assert.ok(Number(base.port)>1024);
const databaseUrl=disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL);
const root=path.resolve(process.env.SOURCE_STORAGE_ROOT);
assert.ok(root.includes("blablabox-lot2-audit-"));
const db=new PrismaClient({datasources:{db:{url:databaseUrl}}});
const marker=randomUUID();
const password="Audit-only-Aa1-"+randomUUID();
const checkpoints=[];
function decode(value) { return value.replaceAll("&quot;",'"').replaceAll("&#x27;","'").replaceAll("&amp;","&").replaceAll("&lt;","<").replaceAll("&gt;",">"); }
function forms(html) {
  return [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m=>{
    const inputs=[...m[1].matchAll(/<input\b[^>]*>/g)].map(i=>{
      const name=i[0].match(/name="([^"]*)"/)?.[1], value=i[0].match(/value="([^"]*)"/)?.[1]??"";
      return [decode(name??""),decode(value)];
    });
    return {html:m[1],inputs:Object.fromEntries(inputs)};
  });
}
class Session {
  cookies=new Map();
  async request(url,init={}) {
    const headers=new Headers(init.headers);
    headers.set("Origin",base.origin);
    if(this.cookies.size) headers.set("Cookie",[...this.cookies].map(([k,v])=>k+"="+v).join("; "));
    const res=await fetch(new URL(url,base),{...init,headers,redirect:"manual"});
    for(const cookie of res.headers.getSetCookie()) {
      const pair=cookie.split(";")[0], index=pair.indexOf("="), name=pair.slice(0,index), value=pair.slice(index+1);
      if(!value || /Max-Age=0/i.test(cookie)) this.cookies.delete(name); else this.cookies.set(name,value);
    }
    return res;
  }
  async form(url,predicate) {
    const res=await this.request(url); assert.equal(res.status,200,"GET "+url);
    const form=forms(await res.text()).find(predicate); assert.ok(form,"Formulaire trouvé sur "+url);
    assert.ok(Object.keys(form.inputs).some(k=>k.startsWith("$ACTION_ID_")));
    return form;
  }
  async submitForm(form,fields={},url="/courses") {
    const body=new FormData();
    for(const [k,v] of Object.entries({...form.inputs,...fields})) if(k) body.set(k,v);
    return this.request(url,{method:"POST",body});
  }
  async submit(predicate,fields={},url="/courses") { return this.submitForm(await this.form(url,predicate),fields,url); }
  async upload(bytes,name,part="",type="application/pdf") {
    const body=new FormData(); body.set("file",new Blob([bytes],{type}),name); body.set("coursePartId",part);
    return this.request("/api/sources",{method:"POST",body});
  }
}
function redirect(res,location="/courses") { assert.equal(res.status,303); assert.equal(res.headers.get("location"),location); }
function has(name,id) { return f=>Object.hasOwn(f.inputs,name) && (id===undefined || f.inputs[name]===id); }
function createFor(parent,id,field="title") {return f=>has(parent,id)(f)&&Object.hasOwn(f.inputs,field)&&!f.html.includes("Modifier")&&!f.html.includes("Trier");}
const a=new Session(),b=new Session(),anon=new Session();
let aId,bId;
async function checkpoint(label,expected) {
  const files=(await readdir(root)).sort();
  const assets=await db.sourceAsset.findMany({where:{userId:{in:[aId,bId]}},orderBy:{storageKey:"asc"}});
  const actual={assets:assets.length,imports:await db.sourceImport.count({where:{userId:{in:[aId,bId]}}}),placements:await db.sourcePlacement.count({where:{userId:{in:[aId,bId]}}}),files:files.length};
  assert.deepEqual(actual,expected,label);
  assert.deepEqual(files,assets.map(s=>s.storageKey).sort(),"Chaque fichier correspond à un original en base");
  for(const asset of assets) assert.equal((await readFile(path.join(root,asset.storageKey))).length,asset.byteSize);
  checkpoints.push({label,...actual});
}
try {
  assert.equal((await anon.request("/courses")).status,307);
  assert.equal((await anon.request("/api/sources/unknown/download")).status,401);
  assert.equal((await anon.upload(syntheticPdf(),"x.pdf")).status,401);
  assert.doesNotMatch(await (await anon.request("/login")).text(),/>Mes cours</);
  for(const [session,suffix] of [[a,"a"],[b,"b"]]) {
    const email=`lot2-http-${marker}-${suffix}@example.invalid`;
    redirect(await session.submit(f=>f.html.includes("Créer mon compte"),{email,password,passwordConfirmation:password},"/register"),"/projects");
    const user=await db.user.findUniqueOrThrow({where:{email}});
    if(suffix==="a")aId=user.id;else bId=user.id;
  }
  redirect(await a.submit(has("label"),{label:"Année audit",startYear:"2026",endYear:"2027"}));
  const year=await db.schoolYear.findFirstOrThrow({where:{userId:aId}});
  redirect(await a.submit(createFor("schoolYearId",year.id),{title:"Matière audit"}));
  const subject=await db.subject.findFirstOrThrow({where:{userId:aId}});
  redirect(await a.submit(createFor("subjectId",subject.id),{title:"Thème audit"}));
  const theme=await db.courseTheme.findFirstOrThrow({where:{userId:aId}});
  const createPartForm=()=>a.form("/courses",f=>has("courseThemeId",theme.id)(f)&&Object.hasOwn(f.inputs,"referenceLabel"));
  for(const referenceLabel of ["4.2","4.1","4.10"]) redirect(await a.submitForm(await createPartForm(),{title:"Partie "+referenceLabel,referenceLabel,documentExpected:""}));
  assert.equal(await db.chapter.count({where:{userId:aId}}),0);
  const staleSort=await a.form("/courses",f=>f.html.includes("Trier les repères"));
  redirect(await a.submitForm(staleSort));
  assert.deepEqual((await db.coursePart.findMany({where:{userId:aId},orderBy:{position:"asc"}})).map(p=>p.referenceLabel),["4.1","4.2","4.10"]);
  redirect(await a.submitForm(staleSort),"/courses?error=stale-order");
  const staleAlert=await a.request("/courses?error=stale-order");
  assert.equal(staleAlert.status,200);
  const alertHtml=await staleAlert.text();
  assert.match(alertHtml,/role="alert"/); assert.match(alertHtml,/cours a changé/i); assert.match(alertHtml,/relance la proposition/i);
  redirect(await a.submitForm(await createPartForm(),{title:"Document attendu",referenceLabel:"5",documentExpected:"on"}));
  const expected=await db.coursePart.findFirstOrThrow({where:{userId:aId,state:"DOCUMENT_EXPECTED"}});
  const parts=await db.coursePart.findMany({where:{userId:aId},orderBy:{position:"asc"}});
  const pdf=syntheticPdf("original");
  redirect(await a.upload(pdf,"cours.pdf",expected.id),"/courses?uploaded=1");
  assert.equal((await db.coursePart.findUniqueOrThrow({where:{id:expected.id}})).state,"NORMAL");
  const duplicate=await a.upload(pdf,"renamed.pdf",parts[0].id);
  assert.equal(duplicate.status,303);
  const first=await db.sourceAsset.findFirstOrThrow({where:{userId:aId}});
  assert.equal(new URL(duplicate.headers.get("location"),base).searchParams.get("duplicate"),first.id);
  await checkpoint("doublon renommé sans rattachement implicite",{assets:1,imports:2,placements:1,files:1});
  const confirmation=await a.form(duplicate.headers.get("location"),f=>f.html.includes("Rattacher le document"));
  redirect(await a.submitForm(confirmation));
  redirect(await a.submitForm(confirmation));
  await checkpoint("rattachement confirmé idempotent",{assets:1,imports:2,placements:2,files:1});
  redirect(await a.upload(syntheticPdf("different"),"cours.pdf",parts[1].id),"/courses?uploaded=1");
  await checkpoint("même nom, octets différents",{assets:2,imports:3,placements:3,files:2});
  const concurrent=await Promise.all([a.upload(syntheticPdf("concurrent"),"one.pdf",parts[2].id),a.upload(syntheticPdf("concurrent"),"two.pdf",parts[2].id)]);
  assert.equal(concurrent.filter(r=>r.headers.get("location")==="/courses?uploaded=1").length,1);
  assert.ok(concurrent.every(r=>r.status===303));
  await checkpoint("deux imports HTTP concurrents",{assets:3,imports:5,placements:4,files:3});
  redirect(await b.upload(pdf,"cours.pdf"),"/courses?uploaded=1");
  await checkpoint("même contenu autre compte sans déduplication visible",{assets:4,imports:6,placements:4,files:4});
  redirect(await a.upload(syntheticOdt(),"cours.odt","","application/vnd.oasis.opendocument.text"),"/courses?uploaded=1");
  const unicodeName='../étrange"\r\n世界 🦎.pdf';
  redirect(await a.upload(syntheticPdf("unicode"),unicodeName),"/courses?uploaded=1");
  await checkpoint("ODT et nom Unicode",{assets:6,imports:8,placements:4,files:6});
  const download=await a.request(`/api/sources/${first.id}/download`);
  assert.equal(download.status,200); assert.equal(download.headers.get("content-type"),"application/pdf");
  assert.equal(download.headers.get("cache-control"),"private, no-store");
  assert.equal(download.headers.get("x-content-type-options"),"nosniff");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
  const unicodeAsset=await db.sourceAsset.findFirstOrThrow({where:{userId:aId,imports:{some:{originalFileName:{contains:"世界"}}}}});
  const unicodeDownload=await a.request(`/api/sources/${unicodeAsset.id}/download`);
  assert.equal(unicodeDownload.status,200);
  assert.match(unicodeDownload.headers.get("content-disposition"),/filename\*=UTF-8''/);
  assert.doesNotMatch(unicodeDownload.headers.get("content-disposition"),/[\r\n]/);
  const snapshot=await db.coursePart.findMany({where:{userId:aId},orderBy:{id:"asc"}});
  const foreignForms=[
    [await a.form("/courses",f=>has("schoolYearId",year.id)(f)&&f.html.includes("Modifier")),{label:"Attack"}],
    [await a.form("/courses",f=>has("subjectId",subject.id)(f)&&f.html.includes("Modifier")),{title:"Attack"}],
    [await a.form("/courses",f=>has("courseThemeId",theme.id)(f)&&f.html.includes("Modifier le thème")),{title:"Attack"}],
    [await a.form("/courses",f=>f.html.includes("Trier les repères")),{}],
    [await a.form("/courses",f=>has("partId",expected.id)(f)&&has("direction","up")(f)),{}],
    [await a.form("/courses",f=>has("partId",expected.id)(f)&&f.html.includes("Modifier le titre")),{title:"Attack"}],
    [await createPartForm(),{title:"Attack",referenceLabel:"9"}],
    [confirmation,{}],
    [await a.form("/courses",createFor("schoolYearId",year.id)),{title:"Attack"}],
    [await a.form("/courses",createFor("subjectId",subject.id)),{title:"Attack"}],
  ];
  for(const [form,fields] of foreignForms) assert.equal((await b.submitForm(form,fields)).status,404);
  assert.equal((await b.upload(pdf,"x.pdf",expected.id)).status,404);
  assert.equal((await b.request(`/api/sources/${first.id}/download`)).status,404);
  assert.equal((await b.request(`/courses?duplicate=${first.id}`)).status,404);
  assert.equal((await b.request(`/courses?part=${expected.id}`)).status,404);
  assert.doesNotMatch(await (await b.request("/courses")).text(),/Année audit|Matière audit|Thème audit|Partie 4/);
  assert.deepEqual(await db.coursePart.findMany({where:{userId:aId},orderBy:{id:"asc"}}),snapshot);
  const anonymousAction=await anon.submitForm(foreignForms[0][0],{label:"Attack"});
  redirect(anonymousAction,"/login");
  for(const [bytes,name,type] of [[syntheticPdf(),"fake.odt","application/vnd.oasis.opendocument.text"],[syntheticOdt(),"fake.pdf","application/pdf"],[Buffer.from("bad"),"bad.pdf","application/pdf"],[syntheticPdf(),"bad.pdf","text/html"],[new Uint8Array(),"empty.pdf","application/pdf"]]) redirect(await a.upload(bytes,name,"",type),"/courses?error=format-or-size");
  const large=new Uint8Array(25*1024*1024+1);
  redirect(await a.upload(large,"large.pdf"),"/courses?error=file-too-large");
  let chunks = 0;
  const stream = new ReadableStream({ pull(controller) { if (chunks++ < 28) controller.enqueue(new Uint8Array(1024*1024)); else controller.close(); } });
  redirect(await a.request("/api/sources",{method:"POST",headers:{"Content-Type":"multipart/form-data; boundary=synthetic"},body:stream,duplex:"half"}),"/courses?error=file-too-large");
  const crossOrigin=new FormData(); crossOrigin.set("file",new Blob([pdf],{type:"application/pdf"}),"x.pdf");
  const forbidden=await fetch(new URL("/api/sources",base),{method:"POST",headers:{Origin:"https://attacker.invalid",Cookie:[...a.cookies].map(([k,v])=>k+"="+v).join("; ")},body:crossOrigin,redirect:"manual"});
  assert.equal(forbidden.status,403);
  await checkpoint("refus étrangers, anonymes et fichiers invalides sans effet",{assets:6,imports:8,placements:4,files:6});
  // Genuine forms also allow a later explicit chapter assignment, without changing the part ID.
  redirect(await a.submit(f=>has("courseThemeId",theme.id)(f)&&f.html.includes("Ajouter un chapitre"),{title:"Chapitre explicite"}));
  const chapter=await db.chapter.findFirstOrThrow({where:{userId:aId}});
  const editChapter=await a.form("/courses",has("chapterId",chapter.id));
  assert.equal((await b.submitForm(editChapter,{title:"Attack"})).status,404);
  redirect(await a.submitForm(editChapter,{title:"Chapitre renommé"}));
  redirect(await a.submit(f=>has("partId",expected.id)(f)&&f.html.includes("Modifier le titre"),{title:"Document reçu",referenceLabel:"5",chapterId:chapter.id}));
  assert.equal((await db.coursePart.findUniqueOrThrow({where:{id:expected.id}})).chapterId,chapter.id);
  const longYear=await a.submit(f=>has("label")(f)&&!has("schoolYearId")(f),{label:"x".repeat(81)});
  redirect(longYear,"/courses?error=invalid-fields");
  const html=await (await a.request("/courses")).text();
  for(const key of ["storageKey","SOURCE_STORAGE_ROOT","SOURCE_UPLOAD_MAX_BYTES","passwordHash","tokenHash"]) assert.ok(!html.includes(key),key+" absent du HTML");
  assert.ok(!html.includes(root));
  assert.match(html,/Document enregistré/); assert.match(html,/Documents à classer/);
  const report={accounts:2,parts:4,chaptersCreatedImplicitly:0,chaptersCreatedExplicitly:1,foreignActionRefusals:foreignForms.length+1,checkpoints,downloadBytesMatch:true,unicodeDownload:true,anonymousRefused:true,invalidInputsRefused:true};
  const state=JSON.parse(await readFile(process.env.LOT2_AUDIT_STATE,"utf8"));
  await writeFile(path.join(state.root,"http-result.json"),JSON.stringify(report,null,2));
  // Disposable session for optional local browser inspection; never written to repository.
  await writeFile(path.join(state.root,"browser-session.json"),JSON.stringify({base:base.origin,email:`lot2-http-${marker}-a@example.invalid`,password,cookies:[...a.cookies]}));
  console.log(JSON.stringify(report,null,2));
} finally { await db.$disconnect(); }
