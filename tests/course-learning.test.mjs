import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { readLearningDocument } from '../lib/courses/document-reader.ts';
import { gradeQuestion, publicQuestion, validateGroundedOutput } from '../lib/courses/learning-contract.ts';
import { generateCourse, getLLMRequestTimeoutMs, LLM_TIMEOUT_MESSAGE, mockCourse, structuredResponse } from '../lib/providers/llm/course-provider.ts';
import { createLearningTrace } from '../lib/courses/learning-trace.ts';
import { getOCRProvider } from '../lib/providers/ocr/index.ts';
import { syntheticPdf, syntheticOdt } from './helpers/source-fixtures.mjs';
const passages=[
  {id:'p1',text:'La germination est le début de la croissance. En 1900, la première observation commence.',quality:'verified',label:'Page 1',method:'native'},
  {id:'p2',text:'La floraison est la formation des fleurs. En 1910, la deuxième observation commence.',quality:'verified',label:'Page 2',method:'native'},
];
const input={mode:'explain',passages,minutes:5};
function imageOdt() {
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLTsAAAAASUVORK5CYII=','base64');
  return zipSync({mimetype:[strToU8('application/vnd.oasis.opendocument.text'),{level:0}],
    'content.xml':strToU8('<office:document-content xmlns:office="urn:office" xmlns:text="urn:text" xmlns:draw="urn:draw" xmlns:xlink="http://www.w3.org/1999/xlink"><office:body><office:text><text:p>Texte avant.</text:p><draw:frame><draw:image xlink:href="Pictures/course.png"/></draw:frame><text:p>Texte après.</text:p></office:text></office:body></office:document-content>'),
    'META-INF/manifest.xml':strToU8('<manifest/>'),'Pictures/course.png':png});
}
test('lecture locale : PDF textuel, scan simulé, ODT textuel et images ordonnées',async()=>{
  const widePdf=syntheticPdf('a sufficiently long synthetic lesson with several facts and no image').toString().replace('/MediaBox [0 0 200 200]','/MediaBox [0 0 900 900]');
  const text=await readLearningDocument(Buffer.from(widePdf),'application/pdf');
  assert.equal(text.length,1);assert.match(text[0].text,/sufficiently long/);assert.equal(text[0].needsVision,false);
  const scan=await readLearningDocument(syntheticPdf(''),'application/pdf');assert.equal(scan[0].needsVision,true);assert.ok(scan[0].image);
  const odt=await readLearningDocument(syntheticOdt('La germination commence avec la graine puis la plante grandit.'),'application/vnd.oasis.opendocument.text');assert.match(odt[0].text,/germination/);
  const images=await readLearningDocument(imageOdt(),'application/vnd.oasis.opendocument.text');assert.deepEqual(images.map(u=>u.key),['text-1','image-1','text-2']);assert.ok(images[1].image);
});
test('lecture refuse format inconnu et références externes ODT',async()=>{
  await assert.rejects(readLearningDocument(new Uint8Array([1]),'application/octet-stream'));
  const bad=zipSync({'content.xml':strToU8('<doc><draw:image xlink:href="https://example.invalid/private"/></doc>')});await assert.rejects(readLearningDocument(bad,'application/vnd.oasis.opendocument.text'));
});
test('explications citées, refus citation étrangère, nombres inventés et évaluation incertaine',()=>{
  for(const mode of ['explain','summary','essential'])assert.ok(validateGroundedOutput(mockCourse({...input,mode}),passages,mode).blocks.length);
  const raw=mockCourse(input);raw.blocks[0].citations[0].passageId='foreign';assert.throws(()=>validateGroundedOutput(raw,passages,'explain'),/vérifier/);
  const invented=mockCourse(input);invented.blocks[0].text+=' En 9999.';assert.throws(()=>validateGroundedOutput(invented,passages,'explain'),/vérifier/);
  assert.throws(()=>validateGroundedOutput(mockCourse({...input,mode:'quiz'}),passages.map(p=>({...p,quality:'uncertain'})),'quiz'),/vérifier/);
});
test('cinq types d’exercices : correction déterministe, QCM unique et projection publique',()=>{
  const output=validateGroundedOutput(mockCourse({...input,mode:'mix'}),passages,'mix');assert.deepEqual(new Set(output.questions.map(q=>q.type)),new Set(['gap','boolean','mcq','order','association']));
  for(const q of output.questions){assert.equal(gradeQuestion(q,q.expected.join('\n')),true);assert.equal(gradeQuestion(q,'incorrect'),false);assert.deepEqual(Object.keys(publicQuestion(q)),['type','prompt','choices','difficulty']);}
  const ambiguous=structuredClone(output);const q=ambiguous.questions.find(q=>q.type==='mcq');q.choices.push(q.expected[0]);assert.throws(()=>validateGroundedOutput(ambiguous,passages,'mix'),/ambigu/);
});
test('devoir à deux indices et visuel contrôlé',()=>{
  const h=validateGroundedOutput(mockCourse({...input,mode:'homework'}),passages,'homework');assert.equal(h.homework.hints.length,2);assert.ok(h.homework.correction.length);
  const v=mockCourse({...input,mode:'visual'});assert.ok(validateGroundedOutput(v,passages,'visual').visual);v.visual.items[0].parent=1;assert.throws(()=>validateGroundedOutput(v,passages,'visual'),/Relation/);
});
test('OCR : aucun appel sans consentement, service absent, mock sans réseau',async()=>{
  const old=process.env.OCR_PROVIDER;const previous=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw new Error('unexpected network');};
  try{process.env.OCR_PROVIDER='openai';await assert.rejects(getOCRProvider().recognize({image:'x',mime:'image/png',consent:false}),/accord/);process.env.OCR_PROVIDER='disabled';await assert.rejects(getOCRProvider().recognize({image:'x',mime:'image/png',consent:true}),/configur/);process.env.OCR_PROVIDER='mock';assert.ok((await getOCRProvider().recognize({image:'x',mime:'image/png',consent:true})).text);assert.equal(calls,0);}finally{global.fetch=previous;if(old===undefined)delete process.env.OCR_PROVIDER;else process.env.OCR_PROVIDER=old;}
});
test('provider : timeout, erreur, refus et absence de recherche Web',async()=>{
  const previous=global.fetch;const previousTimeout=process.env.LLM_REQUEST_TIMEOUT_MS;
  try{delete process.env.LLM_REQUEST_TIMEOUT_MS;assert.equal(getLLMRequestTimeoutMs(),120000);assert.equal(getLLMRequestTimeoutMs('180000'),180000);assert.equal(getLLMRequestTimeoutMs('bad'),120000);assert.equal(getLLMRequestTimeoutMs('300001'),120000);await assert.rejects(structuredResponse('','synthetic','instructions','input',{}),/configur/);global.fetch=async(_url,options)=>{assert.equal('tools' in JSON.parse(options.body),false);assert.equal(JSON.parse(options.body).store,false);return new Response('',{status:503});};await assert.rejects(structuredResponse('synthetic','synthetic','instructions','input',{}),/indisponible/);global.fetch=async(_url,options)=>{options.signal.throwIfAborted();throw new Error('Unexpected');};await assert.rejects(structuredResponse('synthetic','synthetic','instructions','input',{},AbortSignal.abort()),/abort/i);global.fetch=async()=>{throw new DOMException('timed out','TimeoutError');};await assert.rejects(structuredResponse('synthetic','synthetic','instructions','input',{}),new RegExp(LLM_TIMEOUT_MESSAGE));global.fetch=async()=>Response.json({output:[{type:'message',content:[{type:'refusal'}]}]});await assert.rejects(structuredResponse('synthetic','synthetic','instructions','input',{}),/traiter/);}finally{global.fetch=previous;if(previousTimeout===undefined)delete process.env.LLM_REQUEST_TIMEOUT_MS;else process.env.LLM_REQUEST_TIMEOUT_MS=previousTimeout;}
});

test('un worker terminé sans résultat libère la lecture au lieu de laisser une promesse suspendue',{timeout:3000},async()=>{
  const previous=process.cwd();const directory=await mkdtemp(path.join(tmpdir(),'blablabox-reader-exit-'));
  try {
    await mkdir(path.join(directory,'lib','courses'),{recursive:true});
    await writeFile(path.join(directory,'lib','courses','document-worker.mjs'),'process.exit(0);');
    process.chdir(directory);
    await assert.rejects(readLearningDocument(new Uint8Array([1]),'application/pdf'),/Lecture interrompue/);
  } finally {process.chdir(previous);assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});

const responseFor=data=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:3,output_tokens:4}});
test('budget OpenAI unique : génération, corps, audit et corps audit, sans relance',async t=>{
  const old={LLM_PROVIDER:process.env.LLM_PROVIDER,LLM_API_KEY:process.env.LLM_API_KEY,LLM_REQUEST_TIMEOUT_MS:process.env.LLM_REQUEST_TIMEOUT_MS};
  process.env.LLM_PROVIDER='openai';process.env.LLM_API_KEY='synthetic';process.env.LLM_REQUEST_TIMEOUT_MS='120000';
  try {
    for(const phase of ['generation-fetch','generation-body','audit-fetch','audit-body'])await t.test(phase,async t=>{
      const controller=new AbortController();let budgets=0,calls=0;const events=[];let reached;
      const target=new Promise(resolve=>{reached=resolve;});
      t.mock.method(AbortSignal,'timeout',ms=>{budgets++;assert.equal(ms,120000);return controller.signal;});
      t.mock.method(globalThis,'fetch',async(_url,options)=>{
        calls++;assert.equal(options.signal,controller.signal);
        const current=calls===1?'generation':'audit';
        if(phase===`${current}-fetch`){reached();return new Promise(()=>{});}
        if(phase===`${current}-body`)return {ok:true,json:()=>{reached();return new Promise(()=>{});}};
        return responseFor(calls===1?mockCourse(input):{supported:true,unambiguous:true});
      });
      const result=generateCourse(input,{event:e=>events.push(e),failed:()=>{}});
      const rejection=assert.rejects(result,{message:LLM_TIMEOUT_MESSAGE});
      await target;controller.abort(new DOMException('synthetic timeout','TimeoutError'));await rejection;
      assert.equal(budgets,1);assert.equal(calls,phase.startsWith('generation')?1:2);
      await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,phase.startsWith('generation')?1:2);
      assert.equal(events.includes('audit-end'),false);
    });
  } finally {for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('expiration pendant le corps transforme aussi AbortError en message de délai',async t=>{
  const controller=new AbortController();
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>{controller.abort(new DOMException('synthetic','TimeoutError'));throw new DOMException('synthetic','AbortError');}}));
  await assert.rejects(structuredResponse('synthetic','synthetic','private instruction','private input',{},controller.signal),{message:LLM_TIMEOUT_MESSAGE});
});

test('succès OpenAI simulé : deux appels seulement, même signal et phases complètes',async t=>{
  const oldProvider=process.env.LLM_PROVIDER,oldKey=process.env.LLM_API_KEY;process.env.LLM_PROVIDER='openai';process.env.LLM_API_KEY='synthetic';
  let calls=0;const signals=[],events=[];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{signals.push(options.signal);return responseFor(++calls===1?mockCourse(input):{supported:true,unambiguous:true});});
  try {const result=await generateCourse(input,{event:e=>events.push(e),failed:()=>{}});assert.equal(calls,2);assert.equal(signals[0],signals[1]);assert.deepEqual(result.usage,{inputTokens:6,outputTokens:8});assert.deepEqual(events,['generation-start','generation-end','audit-start','audit-end']);}
  finally {if(oldProvider===undefined)delete process.env.LLM_PROVIDER;else process.env.LLM_PROVIDER=oldProvider;if(oldKey===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=oldKey;}
});

test('journaux : seulement identifiant aléatoire, phase, durée et code nettoyé',t=>{
  const logs=[];t.mock.method(console,'info',line=>logs.push(JSON.parse(line)));
  const trace=createLearningTrace();trace.event('action-start');trace.event('generation-start');trace.failed(new Error('private@example.invalid secret-key cours.odt consigne personnelle'));
  trace.event('private@example.invalid');
  assert.equal(logs.length,3);assert.equal(new Set(logs.map(l=>l.traceId)).size,1);
  assert.match(logs[0].traceId,/^[a-f0-9-]{36}$/);assert.equal(logs[2].phase,'generation-start');assert.equal(logs[2].event,'failed');
  for(const row of logs){assert.ok(row.durationMs>=0);assert.ok(Object.keys(row).every(k=>['scope','traceId','event','phase','durationMs','errorCode'].includes(k)));}
  assert.doesNotMatch(JSON.stringify(logs),/private@|secret-key|cours.odt|consigne personnelle/);
});
