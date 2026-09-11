import assert from 'node:assert/strict';
import { mkdtemp, readdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { disposableDatabaseUrl } from './lot2-environment.mjs';

const url=disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL);
const temp=await mkdtemp(path.join(tmpdir(),'blablabox-learning-migration-'));
const prismaCli=path.resolve('node_modules/prisma/build/index.js');
const db=new PrismaClient({datasources:{db:{url}}});
try {
  const baseline=execFileSync('git',['show','3d3c47276d56f6fc6eb9307fae09cd312c692a11:prisma/schema.prisma'],{encoding:'utf8'});
  await writeFile(path.join(temp,'schema.prisma'),baseline);
  for(const name of await readdir('prisma/migrations')) {
    if(name.startsWith('20260911'))continue;
    await cp(path.join('prisma/migrations',name),path.join(temp,'migrations',name),{recursive:true});
  }
  const deploy=schema=>execFileSync(process.execPath,[prismaCli,'migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
  deploy(path.join(temp,'schema.prisma'));
  await db.$executeRaw`INSERT INTO "Project" ("id","title","sourceContent","targetDurationMinutes","audience","tone","level","learningObjective","updatedAt") VALUES ('learning-baseline-synthetic','Synthetic historical project','Synthetic historical content',5,'10-12 ans','Clair','Simple','Synthetic objective',NOW())`;
  const [before]=await db.$queryRaw`SELECT to_jsonb(p) AS row FROM "Project" p WHERE id='learning-baseline-synthetic'`;
  deploy(path.resolve('prisma/schema.prisma'));
  const [after]=await db.$queryRaw`SELECT to_jsonb(p) - 'courseThemeId' AS row FROM "Project" p WHERE id='learning-baseline-synthetic'`;
  assert.deepEqual(after.row,before.row);
  assert.equal((await db.project.findUnique({where:{id:'learning-baseline-synthetic'}})).userId,null);
  assert.equal(await db.sourceExtraction.count(),0);
  assert.equal(await db.projectVersion.count(),0);
  const migrations=await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(migrations[0].n,7);
  const sql=await readFile('prisma/migrations/20260911120000_add_course_learning_workflows/migration.sql','utf8');
  assert.doesNotMatch(sql,/DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
  console.log('Migration des six versions historiques vers sept : succès, ligne historique inchangée, aucun rattachement automatique.');
} finally {
  await db.$disconnect();
  assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir())+path.sep));
  await rm(temp,{recursive:true,force:true});
}
