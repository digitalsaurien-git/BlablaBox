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
const db = new PrismaClient({datasources:{db:{url:upgradeUrl}}});
try {
  await db.user.createMany({data:[{id:"upgrade-a",email:"upgrade-a@example.invalid",passwordHash:"synthetic-only"},{id:"upgrade-b",email:"upgrade-b@example.invalid",passwordHash:"synthetic-only"}]});
  const common={sourceContent:"Synthetic migration audit",targetDurationMinutes:3,audience:"test",tone:"test",level:"test",learningObjective:"synthetic",script:"Script preserved",contentVersion:7,audioStatus:"GENERATED",audioFilePath:"synthetic-never-opened.mp3",audioContentVersion:7};
  await db.project.createMany({data:[{...common,id:"upgrade-project-a",userId:"upgrade-a",title:"A"},{...common,id:"upgrade-project-b",userId:"upgrade-b",title:"B"},{...common,id:"legacy-null-owner",title:"Projet historique sans propriétaire"}]});
  const before = await db.project.findMany({orderBy:{id:"asc"}});
  prismaCommand(upgradeUrl, ["migrate","deploy"]);
  prismaCommand(upgradeUrl, ["migrate","status"]);
  prismaCommand(upgradeUrl, ["migrate","diff","--from-url",upgradeUrl,"--to-schema-datamodel","prisma/schema.prisma","--exit-code"]);
  assert.deepEqual(await db.project.findMany({orderBy:{id:"asc"}}),before);
  const constraints=await db.$queryRaw`SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' ORDER BY conname`;
  assert.ok(constraints.every(c=>c.convalidated));
  const indexes=await db.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`;
  for (const index of ["SourceAsset_userId_sha256_key","CoursePart_userId_courseThemeId_position_idx","SourcePlacement_coursePartId_sourceAssetId_key"]) assert.ok(indexes.some(i=>i.indexname===index));
  const report={fullMigrations:6,upgradePreviousMigrations:5,upgradeMigrations:1,historicalProjectsPreserved:before.length,validatedForeignKeys:constraints.length,indexes:indexes.length,constraints,indexDefinitions:indexes};
  await writeFile(path.join(state.root,"migrations-result.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,constraints:undefined,indexDefinitions:undefined}));
} finally { await db.$disconnect(); }
