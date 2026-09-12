// Run after npm run build, with LOT2_TEST_DATABASE_URL pointing to a disposable
// local database. PLAYWRIGHT_MODULE may point to an existing Playwright package.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { disposableDatabaseUrl } from '../helpers/lot2-environment.mjs';
import { syntheticOdt, syntheticPdf } from '../helpers/source-fixtures.mjs';
import { importSource } from '../../lib/sources/import.ts';
import { createSessionToken, hashSessionToken } from '../../lib/auth/session-core.ts';
import { REJECTED_PRODUCTION_MESSAGE } from '../../lib/courses/learning-errors.ts';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=disposableDatabaseUrl(process.env.LOT2_TEST_DATABASE_URL);
const port=Number(process.env.LEARNING_E2E_PORT||3317);
assert.ok(Number.isInteger(port)&&port>1024&&port<65536);
const base=`http://127.0.0.1:${port}`;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('navigateur réel : soumission, récupération et parcours du cours', {timeout:120000},async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'blablabox-submit-browser-'));
  const db=new PrismaClient({datasources:{db:{url}}});
  const oldRoot=process.env.SOURCE_STORAGE_ROOT;process.env.SOURCE_STORAGE_ROOT=directory;
  const ids=[randomUUID(),randomUUID()];let browser,server;let logs='';
  try {
    await db.user.createMany({data:ids.map(id=>({id,email:`${id}@example.invalid`,passwordHash:'synthetic'}))});
    const token=createSessionToken();
    await db.session.create({data:{userId:ids[0],tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+3600000)}});
    const year=await db.schoolYear.create({data:{userId:ids[0],label:randomUUID()}});
    const subject=await db.subject.create({data:{userId:ids[0],schoolYearId:year.id,title:'Sciences synthétiques'}});
    async function makeCourse(text=true) {
      const course=await db.courseTheme.create({data:{userId:ids[0],subjectId:subject.id,title:randomUUID()}});
      const part=await db.coursePart.create({data:{userId:ids[0],courseThemeId:course.id,title:'Document synthétique',position:0}});
      if(text)await importSource(db,{userId:ids[0],coursePartId:part.id,fileName:'synthetic.odt',declaredMime:'application/vnd.oasis.opendocument.text',bytes:syntheticOdt('La germination est le début de la croissance. La graine développe des racines puis des feuilles.')});
        const scan=await importSource(db,{userId:ids[0],coursePartId:part.id,fileName:'synthetic-scan.pdf',declaredMime:'application/pdf',bytes:syntheticPdf('')});
        if(scan.duplicate)await db.sourcePlacement.create({data:{userId:ids[0],coursePartId:part.id,sourceAssetId:scan.sourceAssetId}});
      return course;
    }
    const course=await makeCourse(),imageOnly=await makeCourse(false);
    server=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{
      windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',DATABASE_URL:url,SOURCE_STORAGE_ROOT:directory,AUDIO_STORAGE_PATH:path.join(directory,'audio'),LLM_PROVIDER:'mock',LLM_API_KEY:'',TTS_PROVIDER:'disabled',TTS_API_KEY:'',OCR_PROVIDER:'disabled',OCR_API_KEY:'',SPEECH_TO_TEXT_PROVIDER:'disabled',WEB_SEARCH_ENABLED:'false',REGISTRATION_ENABLED:'false'},
    });
    server.stdout.on('data',b=>{logs+=b.toString();});server.stderr.on('data',b=>{logs+=b.toString();});
    for(let i=0;i<100;i++) {
      assert.equal(server.exitCode,null,'Owned test server must remain alive');
      if(logs.includes('Ready in'))break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(logs.includes('Ready in'),'Owned test server ready');
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await context.addCookies([{name:'__Host-blablabox_session',value:token,url:base.replace("http:","https:"),secure:true,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const coursePath=`/courses/${course.id}`;
    async function open(relative) {await page.goto(base+relative);await page.waitForLoadState('networkidle');}

    await t.test('un clic atteint la Server Action, pending désactive puis réussite libère',async()=>{
      await open(coursePath+'/understand');
      const received=deferred(),release=deferred();let posts=0;
      const handler=async route=>{
        if(route.request().method()!=='POST')return route.continue();
        posts++;const response=await route.fetch();received.resolve();await release.promise;await route.fulfill({response});
      };
      await page.route('**/courses/**',handler);
      try {
        await page.getByRole('button',{name:'Explique-moi simplement',exact:true}).click();
        await page.getByRole('button',{name:'Préparation en cours…',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Préparation en cours…',exact:true}).isDisabled(),true);
        await received.promise;
        assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'learning',status:'DONE'}}),1,'The real Server Action created an operation');
        assert.equal(posts,1);release.resolve();await page.waitForURL('**/content/*');
        await page.unroute('**/courses/**',handler);
        await open(coursePath+'/understand');assert.equal(await page.getByRole('button',{name:'Explique-moi simplement',exact:true}).isEnabled(),true);
      } finally {release.resolve();await page.unroute('**/courses/**',handler);}
    });

    await t.test('analyse automatique, cours prêt et détails secondaires sur mobile',async()=>{
      await open(coursePath);
      await page.getByRole('heading',{name:'Cours prêt',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Analyser ce cours',exact:true}).count(),0);
      assert.equal(await page.getByRole('navigation',{name:'Travailler ce cours'}).getByRole('link').count(),3);
      assert.equal(await page.getByRole('region',{name:'État du cours'}).getByRole('alert').count(),0);
      await page.getByText('Certaines pages sont des images. Tu peux déjà utiliser le cours, ou améliorer leur lecture.',{exact:true}).waitFor();
      const details=page.locator('details').filter({has:page.locator('summary').getByText('Détails techniques',{exact:true})});
      assert.equal(await details.getAttribute('open'),null);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'ocr'}}),0);
    });

    await t.test('erreur de lecture dans chacun des trois parcours et bouton réactivé',async()=>{
      for(const [route,label] of [['understand','Explique-moi simplement'],['revise?minutes=5','Quiz'],['homework','M’aider à commencer']]) {
        await open(`/courses/${imageOnly.id}/${route}`);
        if(route==='homework')await page.getByRole('textbox').fill('Consigne synthétique');
        await page.getByRole('button',{name:label,exact:true}).click();
        await page.waitForURL('**/*error=reading*');
        assert.ok(new URL(page.url()).pathname.endsWith('/'+route.split('?')[0]));
        await page.getByRole('alert').getByText(/Je n’arrive pas encore/).waitFor();
        assert.equal(await page.getByRole('button',{name:label,exact:true}).isEnabled(),true);
      }
      await open(`/courses/${imageOnly.id}`);assert.equal(await page.getByRole('region',{name:'État du cours'}).getByRole('alert').count(),0);
      assert.equal(await db.projectVersion.count({where:{courseThemeId:imageOnly.id}}),0);
      assert.equal(await db.learningSession.count({where:{courseThemeId:imageOnly.id}}),0);
    });

    await t.test('coupure réseau : sortie de pending, récupération explicite, aucune relance',async()=>{
      await open(coursePath+'/understand');let posts=0;
      const handler=route=>{if(route.request().method()==='POST'){posts++;return route.abort('connectionfailed');}return route.continue();};
      await page.route('**/courses/**',handler);
      await page.getByRole('button',{name:'Fais-moi un résumé',exact:true}).click();
      await page.getByRole('button',{name:'Revenir au formulaire',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Préparation en cours…',exact:true}).count(),0);assert.equal(posts,1);
      await page.unroute('**/courses/**',handler);
      await page.getByRole('button',{name:'Revenir au formulaire',exact:true}).click();
      await page.getByRole('button',{name:'Fais-moi un résumé',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Fais-moi un résumé',exact:true}).isEnabled(),true);
      assert.equal(posts,1);assert.equal(await db.projectVersion.count({where:{userId:ids[0],mode:'summary'}}),0);
    });

    await t.test('consentement visuel requis et erreur limitée à cette section',async()=>{
      await open(coursePath);
      await page.getByText('Améliorer la lecture des pages en images',{exact:true}).click();
      const visual=page.locator('#course-reading');
      await visual.getByRole('button',{name:'Analyser les pages choisies',exact:true}).click();
      assert.equal(await visual.getByRole('button',{name:'Analyser les pages choisies',exact:true}).isEnabled(),true);
      assert.equal(await db.providerUsage.count({where:{userId:ids[0],operation:'ocr'}}),0);
      // Consent with no page is rejected before the disabled provider is touched.
      await visual.locator('input[name=consent]').check();
      await visual.getByRole('button',{name:'Analyser les pages choisies',exact:true}).click();
      await page.waitForURL('**/*readingError=consent*');
      await page.locator('#course-reading').getByRole('alert').waitFor();
      assert.equal(await page.getByRole('region',{name:'État du cours'}).getByRole('alert').count(),0);
    });

    await t.test('rejet de génération distinct de la lecture et omission sobre sur le contenu',async()=>{
      await open(coursePath+'/understand?error=generation');
      const errorNotice=page.getByRole('alert').filter({hasText:REJECTED_PRODUCTION_MESSAGE});
      assert.equal(await errorNotice.innerText(),REJECTED_PRODUCTION_MESSAGE);
      assert.equal(await errorNotice.getByRole('link').count(),0);
      assert.equal(await page.getByRole('button',{name:'Explique-moi simplement',exact:true}).isEnabled(),true);
      const version=await db.projectVersion.findFirstOrThrow({where:{userId:ids[0],mode:'explain'}});
      await db.projectVersion.update({where:{id:version.id},data:{content:{...version.content,elementsOmitted:true}}});
      await open(coursePath+'/content/'+version.id);
      await page.getByRole('status').getByText('Certains éléments ont été écartés. Voici ceux que nous avons pu vérifier.',{exact:true}).waitFor();
      for(const block of version.content.blocks)await page.getByText(block.text,{exact:true}).first().waitFor();
    });

    await t.test('réponses et correction absentes du HTML avant tentative, même avec un ancien drapeau',async()=>{
      await open(coursePath+'/revise?minutes=5');
      await page.getByRole('button',{name:'Quiz',exact:true}).click();await page.waitForURL('**/session/*');
      const revisionId=new URL(page.url()).pathname.split('/').at(-1);
      const revision=await db.learningSession.findUniqueOrThrow({where:{id:revisionId},include:{projectVersion:true}});
      const revisionContent=structuredClone(revision.projectVersion.content);
      revisionContent.questions[0].expected=['EXPECTED_REVISION_CANARY'];revisionContent.questions[0].explanation='FEEDBACK_CANARY';
      await db.projectVersion.update({where:{id:revision.projectVersionId},data:{content:revisionContent}});
      await open(coursePath+'/session/'+revisionId);
      for(const marker of ['EXPECTED_REVISION_CANARY','FEEDBACK_CANARY'])assert.equal((await page.content()).includes(marker),false);
      await page.getByRole('radio').first().check();await page.getByRole('button',{name:'Vérifier ma réponse',exact:true}).click();
      await page.getByText('Réponse attendue : EXPECTED_REVISION_CANARY',{exact:true}).waitFor();

      await open(coursePath+'/homework');await page.getByRole('textbox').fill('Consigne synthétique');
      await page.getByRole('button',{name:'M’aider à commencer',exact:true}).click();await page.waitForURL('**/session/*');
      const homeworkId=new URL(page.url()).pathname.split('/').at(-1);
      const homework=await db.learningSession.findUniqueOrThrow({where:{id:homeworkId},include:{projectVersion:true}});
      const homeworkContent=structuredClone(homework.projectVersion.content);
      homeworkContent.homework.correction[0].text='CORRECTION_HOMEWORK_CANARY';
      await db.projectVersion.update({where:{id:homework.projectVersionId},data:{content:homeworkContent}});
      await db.learningSession.update({where:{id:homeworkId},data:{correctionRequested:true}});
      await open(coursePath+'/session/'+homeworkId);
      assert.equal((await page.content()).includes('CORRECTION_HOMEWORK_CANARY'),false);
      assert.equal(await page.getByRole('button',{name:'Je demande à voir la correction expliquée',exact:true}).count(),0);
      await page.getByRole('textbox').fill('Tentative synthétique');
      await page.getByRole('button',{name:'Regarder ma réponse',exact:true}).click();
      await page.getByText('Comparer avec une correction expliquée',{exact:true}).click();
      await page.getByText('CORRECTION_HOMEWORK_CANARY',{exact:true}).waitFor();
    });

    await t.test('isolation HTTP et traces dépourvues de données personnelles',async()=>{
      const tokenB=createSessionToken();await db.session.create({data:{userId:ids[1],tokenHash:hashSessionToken(tokenB),expiresAt:new Date(Date.now()+3600000)}});
      await context.clearCookies();await context.addCookies([{name:'__Host-blablabox_session',value:tokenB,url:base.replace("http:","https:"),secure:true,httpOnly:true,sameSite:'Lax'}]);
      const response=await page.goto(base+coursePath);assert.equal(response.status(),404);
      const traceLines=logs.split(/\r?\n/).filter(line=>line.startsWith('{"scope":"course-learning"')).map(line=>JSON.parse(line));
      assert.ok(traceLines.some(l=>l.event==='action-start'));assert.ok(traceLines.some(l=>l.event==='transaction-start'));assert.ok(traceLines.some(l=>l.event==='done'));assert.ok(traceLines.some(l=>l.event==='failed'));
      const traces=JSON.stringify(traceLines);for(const value of [...ids,token,course.id,'synthetic.odt','Consigne synthétique','La germination','@example.invalid','EXPECTED_REVISION_CANARY','CORRECTION_HOMEWORK_CANARY','Tentative synthétique'])assert.equal(traces.includes(value),false);
      assert.equal(await db.providerUsage.count({where:{userId:ids[1]}}),0);
    });
  } finally {
    await browser?.close();
    if(server&&server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}
    await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
    if(oldRoot===undefined)delete process.env.SOURCE_STORAGE_ROOT;else process.env.SOURCE_STORAGE_ROOT=oldRoot;
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});
  }
});
