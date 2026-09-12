import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { activitySchema, validateActivity } from '../lib/courses/activity-contract.ts';
import { generateCourse, mockCourse, OUTPUT_LIMITS, conciseOptions } from '../lib/providers/llm/course-provider.ts';
import { failureUsage, LearningFailure, learningErrorCategory, REJECTED_PRODUCTION_MESSAGE } from '../lib/courses/learning-errors.ts';
import { createLearningTrace } from '../lib/courses/learning-trace.ts';
import { evidenceContext } from '../lib/courses/evidence.ts';

const passages=[{id:'owned',text:'La graine germe en 3 jours. Elle forme des racines.',quality:'verified',label:'Synthétique',method:'native'}];
const good={text:'La graine germe en 3 jours.',kind:'explanation',citations:[{passageId:'owned',quote:'La graine germe en 3 jours.'}]};
const input={mode:'explain',minutes:5,passages};
const response=(data,usage={input_tokens:50,output_tokens:20})=>{
  const wire=data.blocks&&!data.visual?{blocks:data.blocks.map(({text,kind,citations})=>({text,kind,segmentIds:citations.map(ref=>evidenceContext(passages).segments.find(e=>e.passageId===ref.passageId&&e.text===ref.quote)?.id??'foreign')}))}:data;
  return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(wire)}]}],usage});
};
function provider(t){for(const key of ['LLM_PROVIDER','LLM_API_KEY','LLM_MODEL']){const old=process.env[key];t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}process.env.LLM_PROVIDER='openai';process.env.LLM_API_KEY='synthetic';process.env.LLM_MODEL='gpt-5-mini';}

test('contrats distincts : aucun exercice caché dans une explication',()=>{
  for(const mode of ['explain','summary','essential']) {
    const schema=z.toJSONSchema(activitySchema(mode));assert.deepEqual(Object.keys(schema.properties),['blocks']);
    assert.ok(OUTPUT_LIMITS[mode]<3000);
    const data=validateActivity({blocks:[good],questions:[{invalid:'ignored'}],homework:{expected:'secret'},visual:'invalid'},passages,mode);
    assert.deepEqual(data.questions,[]);assert.equal(data.homework,null);assert.equal(data.visual,null);
  }
  assert.deepEqual(Object.keys(activitySchema('visual').shape),['blocks','visual']);
  assert.deepEqual(Object.keys(activitySchema('quiz').shape),['questions']);
  assert.deepEqual(Object.keys(activitySchema('homework').shape),['homework']);
  assert.deepEqual(conciseOptions('gpt-5-mini',true),{reasoning:{effort:'low'},text:{verbosity:'low'}});
  assert.deepEqual(conciseOptions('unknown-model',true),{});
  assert.deepEqual(conciseOptions('gpt-5-pro',true),{});
});

test('validation partielle : structure, références, citations et nombres',()=>{
  for(const [bad,code] of [
    [{...good,citations:[{passageId:'foreign-course-or-user',quote:good.citations[0].quote}]},'UNKNOWN_CITATION'],
    [{...good,citations:[{passageId:'owned',quote:'Citation inventée.'}]},'QUOTE_MISMATCH'],
    [{...good,text:'La graine germe en 77 jours.'},'UNVERIFIABLE_NUMBER'],
    [{text:'invalid'},'INVALID_STRUCTURE'],
  ]) {
    let stats;
    const data=validateActivity({blocks:[good,bad]},passages,'explain',s=>{stats=s;});
    assert.deepEqual(data.blocks,[good]);assert.equal(data.elementsOmitted,true);
    assert.deepEqual(stats,{totalBlocks:2,acceptedBlocks:1,rejectedBlocks:1,codes:[code]});
    assert.throws(()=>validateActivity({blocks:[bad]},passages,'explain'),{code:'NO_USABLE_BLOCKS'});
  }
  assert.throws(()=>validateActivity({blocks:[good]},[], 'explain'),{code:'NO_USABLE_BLOCKS'});
  assert.deepEqual(validateActivity({blocks:[good,...Array(9).fill({text:'invalid'})]},passages,'explain').blocks,[good]);
});

test('visuels : suppression de parents invalides, remappage et alternative textuelle',()=>{
  const item=(parent,label='Germination')=>({label,detail:good.text,parent,citations:good.citations});
  const data=validateActivity({blocks:[good],visual:{type:'concepts',title:'Synthétique',items:[item(-1),{...item(-1),citations:[]},item(1),item(0)]}},passages,'visual');
  assert.equal(data.visual.items.length,2);assert.equal(data.visual.items[1].parent,0);assert.equal(data.elementsOmitted,true);
  const textOnly=validateActivity({blocks:[],visual:{type:'concepts',title:'Synthétique',items:[item(-1)]}},passages,'visual');
  assert.equal(textOnly.visual,null);assert.equal(textOnly.blocks.length,1);
  const visualOnly=validateActivity({visual:{type:'concepts',title:'Synthétique',items:[item(-1),item(0)]}},passages,'visual');
  assert.equal(visualOnly.visual.items.length,2);assert.equal(visualOnly.blocks.length,2);
});

test('exercices et devoirs : un élément invalide refuse tout',()=>{
  for(const mode of ['quiz','homework']) {
    const raw=mockCourse({...input,mode});
    if(mode==='quiz')raw.questions[0].citations=[{passageId:'foreign',quote:'x'}];
    else raw.homework.correction[0]={...good,text:'77 jours.'};
    assert.throws(()=>validateActivity(raw,passages,mode),{code:mode==='quiz'?'UNKNOWN_CITATION':'UNVERIFIABLE_NUMBER'});
  }
});

test('rejet après réponse : compteurs conservés, aucun audit ni relance',async t=>{
  provider(t);let calls=0;const lines=[];t.mock.method(console,'info',s=>lines.push(JSON.parse(s)));
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    calls++;const body=JSON.parse(options.body);
    assert.deepEqual(Object.keys(body.text.format.schema.properties),['blocks']);
    assert.equal(body.max_output_tokens,2400);assert.equal(body.reasoning.effort,'low');assert.equal(body.text.verbosity,'low');
    return response({blocks:[{...good,text:'999 jours.'}]});
  });
  const trace=createLearningTrace();let failure;
  try{await generateCourse(input,trace);}catch(error){failure=error;trace.failed(error);}
  assert.equal(failure.code,'NO_USABLE_BLOCKS');assert.deepEqual(failureUsage(failure),{inputTokens:50,outputTokens:20});
  assert.equal(calls,1);assert.equal(learningErrorCategory(failure),'generation');
  assert.match(REJECTED_PRODUCTION_MESSAGE,/a été préparée/);assert.doesNotMatch(REJECTED_PRODUCTION_MESSAGE,/lecture|réanaly/);
  assert.ok(lines.some(l=>l.errorCode==='UNVERIFIABLE_NUMBER'&&l.rejectedBlocks===1));
  assert.equal(lines.at(-1).inputTokens,50);assert.equal(lines.at(-1).activity,'explain');
  for(const value of ['La graine','owned','synthetic','999','Synthétique'])assert.equal(JSON.stringify(lines).includes(value),false);
});

test('audit sémantique indispensable : rejette la contradiction même avec citation exacte',async t=>{
  provider(t);let calls=0;
  const contrary={...good,text:'La graine ne germe pas en 3 jours.'};
  // Lexical validation alone accepts the negation: it cannot replace this audit.
  assert.equal(validateActivity({blocks:[good,contrary]},passages,'explain').blocks.length,2);
  t.mock.method(globalThis,'fetch',async()=>response(++calls===1?{blocks:[good,contrary]}:{decisions:[{id:'b0',supported:true},{id:'b1',supported:false}]}));
  const result=await generateCourse(input);assert.equal(calls,2);assert.deepEqual(result.data.blocks,[good]);
  assert.equal(result.data.elementsOmitted,true);assert.deepEqual(result.usage,{inputTokens:100,outputTokens:40});
});

test('audit : rejet complet et réponse mal formée préservent les deux consommations',async t=>{
  for(const [audit,code] of [[{decisions:[{id:'b0',supported:false}]},'AUDIT_REJECTED'],[{decisions:[]},'INVALID_STRUCTURE']])await t.test(code,async t=>{
    provider(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>response(++calls===1?{blocks:[good]}:audit));
    await assert.rejects(generateCourse(input),error=>{assert.equal(error.code,code);assert.deepEqual(failureUsage(error),{inputTokens:100,outputTokens:40});return true;});assert.equal(calls,2);
  });
});

test('audit visuel : parent refusé supprime ses descendants et les traces comptent les éléments conservés',async t=>{
  provider(t);let calls=0;const events=[];
  const item=(parent)=>({label:'Germination',detail:good.text,parent,citations:good.citations});
  t.mock.method(globalThis,'fetch',async()=>response(++calls===1?
    {blocks:[good],visual:{type:'concepts',title:'Synthétique',items:[item(-1),item(0)]}}:
    {decisions:[{id:'b0',supported:true},{id:'v0',supported:false},{id:'v1',supported:true}]}));
  const result=await generateCourse({...input,mode:'visual'},{event:(event,metadata)=>events.push({event,...metadata}),failed:()=>{}});
  assert.equal(calls,2);assert.equal(result.data.visual,null);assert.deepEqual(result.data.blocks,[good]);
  const audit=events.find(e=>e.event==='audit-end');assert.equal(audit.totalBlocks,3);assert.equal(audit.acceptedBlocks,1);assert.equal(audit.rejectedBlocks,2);
});

test('audit expiré : budget unique et compteurs reçus avant expiration conservés',async t=>{
  provider(t);const controller=new AbortController();let timers=0,calls=0;
  const old=process.env.LLM_REQUEST_TIMEOUT_MS;delete process.env.LLM_REQUEST_TIMEOUT_MS;t.after(()=>{if(old!==undefined)process.env.LLM_REQUEST_TIMEOUT_MS=old;});
  t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,120000);timers++;return controller.signal;});
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    calls++;assert.equal(options.signal,controller.signal);
    if(calls===1)return response({blocks:[good]});
    return {ok:true,json:()=>{queueMicrotask(()=>controller.abort(new DOMException('synthetic','TimeoutError')));return new Promise(()=>{});}};
  });
  await assert.rejects(generateCourse(input),error=>{assert.equal(error.code,'TIMEOUT');assert.deepEqual(failureUsage(error),{inputTokens:50,outputTokens:20});return true;});
  assert.equal(calls,2);assert.equal(timers,1);
});

test('réponse incomplète ou JSON invalide : compteurs disponibles préservés',async t=>{
  provider(t);
  for(const body of [{status:'incomplete',usage:{input_tokens:5,output_tokens:6}},{output:[{type:'message',content:[{type:'output_text',text:'not json'}]}],usage:{input_tokens:5,output_tokens:6}}]) {
    t.mock.method(globalThis,'fetch',async()=>Response.json(body));
    await assert.rejects(generateCourse(input),error=>{assert.equal(error.code,'INVALID_STRUCTURE');assert.deepEqual(failureUsage(error),{inputTokens:5,outputTokens:6});return true;});
  }
});

test('observabilité : métadonnées fermées et codes sans valeurs sensibles',t=>{
  const lines=[];t.mock.method(console,'info',s=>lines.push(JSON.parse(s)));const trace=createLearningTrace();
  trace.activity('explain');trace.event('validation-end',{totalBlocks:2,acceptedBlocks:1,rejectedBlocks:1,inputTokens:4,errorCode:'QUOTE_MISMATCH',text:'secret',quote:'private',outputTokens:-1});
  trace.failed(new LearningFailure('NO_USABLE_BLOCKS'));
  assert.equal(lines[0].outputTokens,undefined);assert.equal(lines[0].text,undefined);assert.equal(lines[0].quote,undefined);
  assert.equal(lines[0].errorCode,'QUOTE_MISMATCH');
});
