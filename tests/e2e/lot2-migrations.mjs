import assert from "node:assert/strict";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { disposableDatabaseUrl } from "../helpers/lot2-environment.mjs";
const statePath = process.env.LOT2_AUDIT_STATE;
assert.ok(statePath, "LOT2_AUDIT_STATE obligatoire");
const state = JSON.parse(await readFile(statePath,"utf8"));
assert.match(path.basename(state.root), /^blablabox-lot2-audit-[a-f0-9]+$/);
const port = Number(process.env.LOT2_AUDIT_PORT);
assert.ok(Number.isInteger(port) && port > 1024 && port !== 5432);
function url(name) { return disposableDatabaseUrl(`postgresql://lot2_audit:${state.password}@127.0.0.1:${port}/${name}`); }
const cli = path.resolve("node_modules/prisma/build/index.js");
function prismaCommand(database, args) {
  const result = spawnSync(process.execPath, [cli,...args], { encoding:"utf8", env:{...process.env,DATABASE_URL:database}, windowsHide:true });
  // CLI output lists the dedicated host/database, never the connection credential.
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  assert.equal(result.status,0, args.join(" "));
}
function prismaSqlCommand(database, schema, file) {
  const result = spawnSync(process.execPath, [cli,"db","execute","--schema",schema,"--file",file], { encoding:"utf8", env:{...process.env,DATABASE_URL:database}, windowsHide:true });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  assert.equal(result.status,0, "db execute historical fixture");
}
const fullUrl = url("lot2_full"), upgradeUrl = url("lot2_upgrade");
prismaCommand(fullUrl, ["migrate","deploy"]);
prismaCommand(fullUrl, ["migrate","status"]);
prismaCommand(fullUrl, ["migrate","diff","--from-url",fullUrl,"--to-schema-datamodel","prisma/schema.prisma","--exit-code"]);
const staging = path.join(state.root,"pre-lot2","prisma");
await mkdir(path.join(staging,"migrations"),{recursive:true});
await cp("prisma/schema.prisma",path.join(staging,"schema.prisma"));
await cp("prisma/migrations/migration_lock.toml",path.join(staging,"migrations","migration_lock.toml"));
for (const name of await readdir("prisma/migrations")) if (name < "20260909120000" && /^\d/.test(name)) await cp(path.join("prisma/migrations",name),path.join(staging,"migrations",name),{recursive:true});
prismaCommand(upgradeUrl, ["migrate","deploy","--schema",path.join(staging,"schema.prisma")]);
const historicalProjects=[
  {id:"upgrade-project-a",userId:"upgrade-a",title:"A",sourceContent:"Synthetic migration audit",targetDurationMinutes:3,audience:"test",tone:"test",level:"test",learningObjective:"synthetic",script:"Script preserved",contentVersion:7,audioStatus:"GENERATED",audioFilePath:"synthetic-never-opened.mp3",audioContentVersion:7},
  {id:"upgrade-project-b",userId:"upgrade-b",title:"B",sourceContent:"Synthetic migration audit",targetDurationMinutes:3,audience:"test",tone:"test",level:"test",learningObjective:"synthetic",script:"Script preserved",contentVersion:7,audioStatus:"GENERATED",audioFilePath:"synthetic-never-opened.mp3",audioContentVersion:7},
  {id:"legacy-null-owner",userId:null,title:"Projet historique sans propriétaire",sourceContent:"Synthetic migration audit",targetDurationMinutes:3,audience:"test",tone:"test",level:"test",learningObjective:"synthetic",script:"Script preserved",contentVersion:7,audioStatus:"GENERATED",audioFilePath:"synthetic-never-opened.mp3",audioContentVersion:7},
];
const fixture=path.join(state.root,"pre-lot2","historical-projects.sql");
await writeFile(fixture,[
  `INSERT INTO "User" ("id","email","passwordHash","updatedAt") VALUES ('upgrade-a','upgrade-a@example.invalid','synthetic-only',NOW()),('upgrade-b','upgrade-b@example.invalid','synthetic-only',NOW());`,
  `INSERT INTO "Project" ("id","userId","title","sourceContent","targetDurationMinutes","audience","tone","level","learningObjective","script","contentVersion","audioStatus","audioFilePath","audioContentVersion","updatedAt") VALUES ${historicalProjects.map(project=>`('${project.id}',${project.userId?`'${project.userId}'`:'NULL'},'${project.title}','${project.sourceContent}',${project.targetDurationMinutes},'${project.audience}','${project.tone}','${project.level}','${project.learningObjective}','${project.script}',${project.contentVersion},'${project.audioStatus}','${project.audioFilePath}',${project.audioContentVersion},NOW())`).join(',')};`,
].join("\n"));
prismaSqlCommand(upgradeUrl,path.join(staging,"schema.prisma"),fixture);
prismaCommand(upgradeUrl, ["migrate","deploy"]);
prismaCommand(upgradeUrl, ["migrate","status"]);
prismaCommand(upgradeUrl, ["migrate","diff","--from-url",upgradeUrl,"--to-schema-datamodel","prisma/schema.prisma","--exit-code"]);
const db = new PrismaClient({datasources:{db:{url:upgradeUrl}}});
try {
  const after=await db.project.findMany({orderBy:{id:"asc"},select:{id:true,userId:true,title:true,sourceContent:true,targetDurationMinutes:true,audience:true,tone:true,level:true,learningObjective:true,script:true,contentVersion:true,audioStatus:true,audioFilePath:true,audioContentVersion:true,courseThemeId:true}});
  assert.deepEqual(after.map(({courseThemeId,...project})=>project),[...historicalProjects].sort((a,b)=>a.id.localeCompare(b.id)));
  assert.ok(after.every(project=>project.courseThemeId===null));
  const constraints=await db.$queryRaw`SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' ORDER BY conname`;
  assert.ok(constraints.every(c=>c.convalidated));
  const indexes=await db.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`;
  for (const index of ["SourceAsset_userId_sha256_key","CoursePart_userId_courseThemeId_position_idx","SourcePlacement_coursePartId_sourceAssetId_key"]) assert.ok(indexes.some(i=>i.indexname===index));
  const report={fullMigrations:7,upgradePreviousMigrations:5,upgradeMigrations:2,historicalProjectsPreserved:after.length,validatedForeignKeys:constraints.length,indexes:indexes.length,constraints,indexDefinitions:indexes};
  await writeFile(path.join(state.root,"migrations-result.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,constraints:undefined,indexDefinitions:undefined}));
} finally { await db.$disconnect(); }
