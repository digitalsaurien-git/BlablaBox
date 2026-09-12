import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateActivity} from '../lib/courses/activity-contract.ts';
import {essentialFacts,essentialSubject,evidenceContext} from '../lib/courses/evidence.ts';
import {generateCourse} from '../lib/providers/llm/course-provider.ts';

const passage=(id,text)=>({id,text,quality:'verified',label:'Synthétique',method:'native'});
const history=passage('history-owned','Cours : Toumaï date de 7 Ma. Le berceau se situe en Afrique. La sécheresse entraîne une migration. Question : Lucy est-elle associée à 3 Ma ?');
const response=data=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:12,output_tokens:8}});

test('repères essentiels : association nom-date prioritaire et question sans réponse exclue',()=>{
  const context=evidenceContext([history]);
  const facts=essentialFacts(context.segments,'Histoire-Géographie');
  assert.equal(facts[0].focus,'association');
  assert.deepEqual(facts[0].labels,['Toumaï','7 Ma']);
  assert.ok(facts[0].kinds.includes('proper-name'));
  assert.ok(facts[0].kinds.includes('date'));
  assert.deepEqual(facts.slice(0,3).map(fact=>fact.focus),['association','proper-name','consequence']);
  assert.doesNotMatch(JSON.stringify({segments:context.segments,facts}),/Lucy|3 Ma/);

  const unanswered=evidenceContext([passage('question-only','Question : Quel personnage date de 7 Ma ? Toumaï, Lucy ou Néandertal ?')]);
  assert.equal(unanswered.segments.length,0);
  assert.equal(essentialFacts(unanswered.segments,'Histoire').length,0);
});

test('adaptation déterministe aux matières : histoire, mathématiques et langue',()=>{
  assert.equal(essentialSubject('Histoire - Géographie'),'history-geography');
  assert.equal(essentialSubject('Mathématiques'),'mathematics');
  assert.equal(essentialSubject('Anglais LV1'),'language');
  const math=evidenceContext([passage('math','Définition : Un triangle rectangle est un triangle avec un angle droit. Pour calculer son aire, on utilise base × hauteur ÷ 2.')]);
  const language=evidenceContext([passage('language','Cours : Le mot house se traduit par maison. Règle : Le sujet doit être placé avant le verbe.')]);
  const mathKinds=new Set(essentialFacts(math.segments,'Mathématiques').flatMap(fact=>fact.kinds));
  const languageKinds=new Set(essentialFacts(language.segments,'Anglais').flatMap(fact=>fact.kinds));
  for(const kind of ['definition','method','formula'])assert.ok(mathKinds.has(kind),kind);
  for(const kind of ['vocabulary','rule'])assert.ok(languageKinds.has(kind),kind);
});

test('essential : trois cartes distinctes, unités exactes, citations serveur, audit et deux appels seulement',async t=>{
  const previous={provider:process.env.LLM_PROVIDER,key:process.env.LLM_API_KEY,model:process.env.LLM_MODEL};
  process.env.LLM_PROVIDER='openai';process.env.LLM_API_KEY='synthetic';process.env.LLM_MODEL='gpt-5-mini';
  t.after(()=>{
    if(previous.provider===undefined)delete process.env.LLM_PROVIDER;else process.env.LLM_PROVIDER=previous.provider;
    if(previous.key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=previous.key;
    if(previous.model===undefined)delete process.env.LLM_MODEL;else process.env.LLM_MODEL=previous.model;
  });
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    calls++;const body=JSON.parse(options.body),payload=JSON.parse(body.input);
    if(calls===1) {
      assert.ok(body.text.format.schema.properties.blocks.items.required.includes('title'));
      assert.equal(payload.subjectProfile,'history-geography');
      assert.deepEqual(payload.keyFacts[0].labels,['Toumaï','7 Ma']);
      assert.equal(payload.segments[0].text,'Cours : Toumaï date de 7 Ma.');
      assert.doesNotMatch(JSON.stringify(payload),/Lucy|3 Ma/);
      const byText=text=>payload.segments.find(segment=>segment.text===text).id;
      return response({blocks:[
        {title:'Toumaï : 7 Ma',text:'Toumaï date de 7 Ma.',kind:'explanation',segmentIds:[byText('Cours : Toumaï date de 7 Ma.')]},
        {title:'Berceau africain',text:'Le berceau se situe en Afrique.',kind:'explanation',segmentIds:[byText('Le berceau se situe en Afrique.')]},
        {title:'Conséquence',text:'La sécheresse entraîne une migration.',kind:'explanation',segmentIds:[byText('La sécheresse entraîne une migration.')]},
      ]});
    }
    assert.equal(payload.elements.length,3);
    assert.deepEqual(payload.elements.map(element=>element.text.split(' ')[0]),['Toumaï','Berceau','Conséquence']);
    return response({decisions:payload.elements.map(element=>({id:element.id,supported:true}))});
  });
  const result=(await generateCourse({mode:'essential',minutes:5,subject:'Histoire-Géographie',passages:[history]})).data;
  assert.equal(calls,2,'one generation and the existing semantic audit');
  assert.equal(result.blocks.length,3);
  assert.deepEqual(result.blocks.map(block=>block.title),['Toumaï : 7 Ma','Berceau africain','Conséquence']);
  assert.equal(new Set(result.blocks.map(block=>block.title)).size,3);
  assert.match(result.blocks[0].text,/Toumaï.*7 Ma/);
  for(const block of result.blocks)for(const citation of block.citations)assert.ok(history.text.includes(citation.quote));
  assert.equal(result.blocks[0].citations[0].quote,'Cours : Toumaï date de 7 Ma.');
});

test('contrat essential : titres courts et distincts, générique rejeté, compte étranger refusé',()=>{
  const context=evidenceContext([history]);
  const [first,second]=context.segments;
  const block=(title,text,segment)=>({title,text,kind:'explanation',segmentIds:[segment.id]});
  const data=validateActivity({blocks:[
    block('Repère humain','Toumaï date de 7 Ma.',first),
    block('Repère humain','Le berceau se situe en Afrique.',second),
    block('Explication à partir du cours','Le berceau se situe en Afrique.',second),
  ]},[history],'essential',undefined,context.resolve);
  assert.equal(data.blocks.length,1);
  assert.equal(data.elementsOmitted,true);
  assert.throws(()=>validateActivity({blocks:[block('x'.repeat(61),'Toumaï date de 7 Ma.',first)]},[history],'essential',undefined,context.resolve),{code:'NO_USABLE_BLOCKS'});
  const foreign=evidenceContext([passage('other-account','Cours : Un secret appartient à un autre compte.')]);
  assert.throws(()=>context.resolve(block('Secret',history.text,foreign.segments[0])),{code:'UNKNOWN_CITATION'});
});

test('cartes : structure mobile, titres accessibles et lien vers le cours conservé',async()=>{
  const source=await readFile(new URL('../components/learning-ui.tsx',import.meta.url),'utf8');
  assert.match(source,/className="grid gap-4"/);
  assert.match(source,/<section className=\{learningPanel\}/);
  assert.match(source,/<h2 className="text-lg font-bold text-moss">\{b\.title/);
  assert.match(source,/Voir dans mon cours/);
  assert.doesNotMatch(source,/Explication à partir du cours/);
});
