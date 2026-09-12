import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvidence,evidenceContext,evidenceSchema,factualEvidence,MAX_EVIDENCE_LENGTH,MAX_EVIDENCE_SEGMENTS} from '../lib/courses/evidence.ts';
import {validateActivity} from '../lib/courses/activity-contract.ts';
import {generateCourse} from '../lib/providers/llm/course-provider.ts';
import {createLearningTrace} from '../lib/courses/learning-trace.ts';

const passage=(id,text,quality='verified')=>({id,text,quality,label:'Synthetic',method:'native'});
const source=passage('synthetic-owned','Cours : L’évolution humaine est progressive. Question : Quel fossile est ancien ? Réponse : Toumaï date de 7 Ma.');
const input={mode:'explain',minutes:5,passages:[source]};
const response=data=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:9,output_tokens:8}});
function fakeProvider(t,generate,audit) {
  for(const [name,value] of Object.entries({LLM_PROVIDER:'openai',LLM_API_KEY:'synthetic',LLM_MODEL:'gpt-5-mini'})){
    const old=process.env[name];process.env[name]=value;t.after(()=>old===undefined?delete process.env[name]:process.env[name]=old);
  }
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body),payload=JSON.parse(body.input);
    calls++;assert.ok(calls<=2,'No repair/retry provider call');
    if(calls===1){assert.equal(body.text.format.schema.properties.blocks.items.properties.citations,undefined);assert.equal(body.text.format.schema.properties.blocks.minItems,2);return response(generate(payload));}
    audit?.(payload);return response({decisions:payload.elements.map(e=>({id:e.id,supported:true}))});
  });
  return ()=>calls;
}

test('segments stables, bornés, positions exactes et séparation locale question/réponse',()=>{
  const segments=buildEvidence([source]);assert.deepEqual(segments,buildEvidence([source]));
  assert.deepEqual(new Set(segments.map(e=>e.category)),new Set(['course','question','answer']));
  for(const e of segments){assert.equal(e.text,source.text.slice(e.start,e.end));assert.ok(e.text.length<=MAX_EVIDENCE_LENGTH);}
  assert.equal(factualEvidence(segments).length,2);
  assert.notDeepEqual(segments.map(e=>e.id),buildEvidence([{...source,id:'foreign-owner'}]).map(e=>e.id));
  const large=buildEvidence([passage('bounded',Array.from({length:300},(_,i)=>`Définition : Le repère ${i} est synthétique.`).join(' '))]);
  assert.equal(large.length,MAX_EVIDENCE_SEGMENTS);assert.ok(large.every(e=>e.text.length<=MAX_EVIDENCE_LENGTH));
  const long=buildEvidence([passage('long','Cours : '+('long '.repeat(300)))]);assert.ok(long.every(e=>e.category==='mixed'));assert.ok(long.every(e=>e.text.length<=400));
  assert.throws(()=>buildEvidence([source,source]),{code:'UNKNOWN_CITATION'});
});

test('questions sans réponse et images incertaines ne deviennent jamais des preuves',async t=>{
  const old=process.env.LLM_PROVIDER;process.env.LLM_PROVIDER='mock';t.after(()=>old===undefined?delete process.env.LLM_PROVIDER:process.env.LLM_PROVIDER=old);
  let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('forbidden');});
  const questions=passage('question','Question : Quand apparaît ce fossile ? Choisis une réponse. 1) En 7 Ma. 2) En 2 Ma.');
  assert.equal(evidenceContext([questions]).segments.length,0);
  await assert.rejects(generateCourse({...input,passages:[questions]}),{code:'SOURCE_UNUSABLE'});
  assert.equal(evidenceContext([{...source,quality:'uncertain'}]).segments.length,0);assert.equal(calls,0);
});

test('citations exactes reconstruites malgré Unicode, espaces et retours de ligne',()=>{
  const p=passage('unicode','Définition : Toumai\u0308\u00a0date de 7 Ma — c’est le repère.\nCours : L’évolution est progressive.');
  const context=evidenceContext([p]);
  for(const e of context.segments){const raw={text:e.text.normalize('NFC'),kind:'explanation',segmentIds:[e.id]};const block=context.resolve(raw);assert.equal(block.citations[0].quote,p.text.slice(e.start,e.end));assert.equal(validateActivity({blocks:[raw]},[p],'explain',undefined,context.resolve).blocks.length,1);}
  for(const id of ['invented',...evidenceContext([{...p,id:'other-account'}]).segments.map(e=>e.id)])assert.throws(()=>context.resolve({text:'Synthétique',kind:'explanation',segmentIds:[id]}),{code:'UNKNOWN_CITATION'});
  assert.throws(()=>context.resolve({text:'Synthétique',kind:'explanation',segmentIds:[context.segments[0].id],start:0,quote:'forged'}),{code:'INVALID_STRUCTURE'});
});

test('deux idées synthétiques, Toumaï et 7 Ma, audit limité aux preuves validées',async t=>{
  let wire;const count=fakeProvider(t,payload=>{
    wire=payload;assert.equal(payload.passages,undefined);assert.equal(payload.segments.length,2);
    const segments=payload.segments;
    return {blocks:[...segments.map(e=>({text:e.text,kind:'explanation',segmentIds:[e.id]})),{text:'999 millions de secrets',kind:'explanation',segmentIds:['foreign']}]};
  },payload=>{
    assert.equal(payload.passages,undefined);assert.equal(payload.elements.length,2);
    assert.equal(payload.evidence.length,2);assert.doesNotMatch(JSON.stringify(payload),/Quel fossile|999|foreign/);
    for(const ref of payload.evidence)assert.ok(source.text.includes(ref.quote));
  });
  const data=(await generateCourse(input)).data;
  assert.equal(count(),2);assert.equal(data.blocks.length,2);assert.equal(data.elementsOmitted,true);
  assert.match(data.blocks.map(b=>b.text).join(' '),/Toumaï.*7 Ma/);assert.equal(new Set(data.blocks.map(b=>b.text)).size,2);
  for(const block of data.blocks)assert.ok(source.text.includes(block.citations[0].quote));
  assert.ok(wire.segments.every(e=>Object.keys(e).every(k=>['id','text','category'].includes(k))));
});

test('sous-couverture tracée sans texte, identifiant de passage, compte ou consigne',async t=>{
  const lines=[];t.mock.method(console,'info',s=>lines.push(JSON.parse(s)));
  fakeProvider(t,payload=>({blocks:[{text:payload.segments[0].text,kind:'explanation',segmentIds:[payload.segments[0].id]}]}));
  const data=(await generateCourse(input,createLearningTrace())).data;
  assert.equal(data.elementsOmitted,false);
  const coverage=lines.find(e=>e.event==='coverage');assert.equal(coverage.errorCode,'LOW_EVIDENCE_COVERAGE');assert.equal(coverage.totalBlocks,2);assert.equal(coverage.acceptedBlocks,1);
  assert.doesNotMatch(JSON.stringify(lines),/Toumaï|progressive|synthetic-owned|segmentIds|7 Ma/);
});

test('schéma modèle sans citations, nombres toujours contrôlés bloc par bloc',()=>{
  const context=evidenceContext([source]);
  for(const mode of ['explain','summary','essential'])assert.deepEqual(Object.keys(evidenceSchema(mode).shape),['blocks']);
  let stats;const e=context.segments.find(e=>e.text.includes('Toumaï'));
  const raw={text:'Toumaï date de 99 Ma.',kind:'explanation',segmentIds:[e.id]};
  assert.throws(()=>validateActivity({blocks:[raw]},[source],'explain',s=>stats=s,context.resolve),{code:'NO_USABLE_BLOCKS'});assert.deepEqual(stats.codes,['UNVERIFIABLE_NUMBER']);
  const valid={...raw,text:'Toumaï date de 7 millions d’années.'};
  assert.equal(validateActivity({blocks:[valid]},[source],'explain',undefined,context.resolve).blocks.length,1);
  const duplicates=validateActivity({blocks:[valid,{...valid,text:'  Toumaï date de 7 millions d’années.  '}]},[source],'explain',undefined,context.resolve);
  assert.equal(duplicates.blocks.length,1);assert.equal(duplicates.elementsOmitted,true);
});
