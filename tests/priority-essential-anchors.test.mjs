import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceContext,essentialFacts} from '../lib/courses/evidence.ts';
import {essentialPlan} from '../lib/courses/essential-plan.ts';
import {generateCourse,mockCourse} from '../lib/providers/llm/course-provider.ts';

const passage=(text,id='owned-synthetic')=>({id,text,quality:'verified',label:'Synthétique',method:'native'});
const flattened="Quels noms portent les anciens parents de l’homme ? Quand ont-ils vécu ? Compétence : savoir remplir un tableau. espèces Toumai Dates 7 Ma";

test('PDF aplati : la réponse explicite après questions et consigne reste un repère fiable',()=>{
  const context=evidenceContext([passage(flattened)]);
  const facts=essentialFacts(context.segments,'Histoire');
  const anchor=facts.find(fact=>fact.focus==='association'&&fact.labels.includes('Toumai'));
  assert.ok(anchor,'Le tableau explicite doit conserver son association nom/date');
  assert.ok(anchor.labels.includes('7 Ma'));
  const segment=context.segments.find(segment=>segment.id===anchor.segmentId);
  assert.equal(segment.text,'espèces Toumai Dates 7 Ma');
  assert.equal(segment.category,'answer');
});

test('lignes explicites générales, accents et citations intactes',()=>{
  for(const text of ['espèces Toumai Dates 7 Ma','espece Toumaï date 7 Ma','espèce : Toumai date : 7 Ma','nom Lucy dates 3 Ma','terme vitesse valeur 5 m','Toumai 7 Ma','Toumai\u0308 7 Ma','nom Gutenberg date 1450']) {
    const source=passage(text);
    const plan=essentialPlan([source],'Histoire');
    assert.equal(plan.slots.length,1,text);
    assert.equal(plan.slots[0].requiredValue,text.includes('1450')?'1450':text.includes('Lucy')?'3 Ma':text.includes('vitesse')?'5 m':'7 Ma');
    const result=mockCourse({mode:'essential',passages:[source],minutes:5,subject:'Histoire'});
    assert.equal(result.blocks[0].citations[0].quote,text);
    assert.equal(result.blocks[0].title.includes(plan.slots[0].requiredTerms[0]),true);
  }
  const noPunctuation='Quels noms portent les anciens parents de l’homme Quand ont-ils vécu Compétence savoir remplir un tableau espèces Toumai Dates 7 Ma';
  const plan=essentialPlan([passage(noPunctuation)],'Histoire');
  assert.equal(plan.slots.length,1);
  assert.equal(plan.slots[0].requiredValue,'7 Ma');
});

test('même ancre sans/avec accent : un seul emplacement, citation exacte conservée',()=>{
  const plan=essentialPlan([passage('espèces Toumai Dates 7 Ma. espèce Toumaï date 7 Ma.')],'Histoire');
  assert.equal(plan.slots.length,1);
});

test('aucun couple inventé dans des colonnes ambiguës ou questions sans réponse',()=>{
  for(const text of [
    'espèces Toumai Lucy Dates 7 Ma 3 Ma',
    'espèces Toumai Dates 7 Ma 3 Ma',
    'Quels noms ? Toumai Lucy 7 Ma 3 Ma',
    'Question : Quel personnage date de 7 Ma ? Toumai ou Lucy ?',
    'Quelle espèce Toumai Dates 7 Ma ?',
    'Choisis nom Toumai dates 7 Ma',
    'Question : Toumai 7 Ma ?',
  ])assert.equal(essentialPlan([passage(text)],'Histoire').slots.length,0,text);
  const ambiguous=essentialFacts(evidenceContext([passage('Toumai et Lucy ont vécu à 7 Ma et 3 Ma.')]).segments,'Histoire');
  assert.ok(ambiguous.every(fact=>!fact.kinds.includes('association')));
  const unrelated=essentialPlan([passage('Toumai est comparé à un autre fossile de 3 Ma.')],'Histoire');
  assert.ok(unrelated.slots.every(slot=>slot.requiredValue===undefined),'cooccurrence sans relation explicite non imposée');
});

test('emplacements déterministes : ancre prioritaire puis catégories, une à trois preuves et matières',()=>{
  for(const [subject,text] of [
    ['Histoire',flattened+'. Cours : Les humains vivent en Afrique. La sécheresse entraîne une migration.'],
    ['Mathématiques','Définition : Un carré est une figure à quatre côtés égaux. Pour calculer le périmètre, on additionne les côtés. La symétrie conserve les longueurs.'],
    ['Anglais','Cours : Le mot house se traduit par maison. Règle : Le sujet doit précéder le verbe. Ensuite on relit la phrase.'],
  ]) {
    const plan=essentialPlan([passage(text)],subject);
    assert.equal(plan.slots.length,3);
    assert.equal(new Set(plan.slots.map(slot=>slot.focus)).size,3);
    assert.deepEqual(plan.slots,essentialPlan([passage(text)],subject).slots);
    assert.equal(mockCourse({mode:'essential',passages:[passage(text)],minutes:5,subject}).blocks.length,3);
  }
  for(const count of [1,2,3]) {
    const sources=Array.from({length:count},(_,i)=>passage(`Définition : la notion${String.fromCharCode(97+i)} est une idée synthétique.`,`owned-${i}`));
    const plan=essentialPlan(sources,'Mathématiques');
    assert.equal(plan.slots.length,count);
    assert.equal(new Set(plan.slots.map(slot=>slot.focus)).size,1);
    assert.equal(mockCourse({mode:'essential',minutes:5,passages:sources}).blocks.length,count);
  }
  const two=essentialPlan([passage('Cours : Toumai date de 7 Ma. La sécheresse entraîne une migration.')],'Histoire');
  assert.equal(new Set(two.slots.map(slot=>slot.focus)).size,2);
  assert.deepEqual(two.slots[0].requiredTerms,['Toumai']);
});

const response=data=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:12,output_tokens:8}});
function provider(t,mutate=raw=>raw,rejectAudit=false) {
  for(const [name,value] of Object.entries({LLM_PROVIDER:'openai',LLM_API_KEY:'synthetic',LLM_MODEL:'gpt-5-mini'})) {
    const old=process.env[name];process.env[name]=value;t.after(()=>old===undefined?delete process.env[name]:process.env[name]=old);
  }
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    calls++;assert.ok(calls<=2,'aucune relance ni troisième appel');
    const body=JSON.parse(options.body),payload=JSON.parse(body.input);
    if(calls===1) {
      assert.ok(body.text.format.schema.properties.blocks.items.required.includes('slotId'));
      assert.equal(body.text.format.schema.properties.blocks.minItems,payload.cardSlots.length);
      assert.equal(body.text.format.schema.properties.blocks.maxItems,payload.cardSlots.length);
      assert.deepEqual(payload.cardSlots[0].requiredTerms,['Toumai']);
      assert.equal(payload.cardSlots[0].requiredValue,'7 Ma');
      const raw={blocks:payload.cardSlots.map((slot,index)=>({slotId:slot.id,title:index===0?'Toumaï : 7 Ma':`Repère ${index===1?'africain':'suivant'}`,text:payload.segments.find(segment=>segment.id===slot.segmentId).text,kind:'explanation',segmentIds:[slot.segmentId]}))};
      return response(mutate(raw,payload));
    }
    assert.doesNotMatch(JSON.stringify(payload),/Quels noms|Compétence|slotId|cardSlots/);
    return response({decisions:payload.elements.map((e,index)=>({id:e.id,supported:!rejectAudit||index!==0}))});
  });
  return ()=>calls;
}
const input=()=>({mode:'essential',minutes:5,subject:'Histoire',passages:[passage(flattened+'. Cours : Le berceau se situe en Afrique. La sécheresse entraîne une migration.')]});

test('cas réel synthétisé : carte obligatoire, citation originale, audit maintenu, deux appels',async t=>{
  const calls=provider(t);
  const result=await generateCourse(input());
  assert.equal(calls(),2);assert.equal(result.data.blocks.length,3);
  assert.equal(result.data.blocks[0].title,'Toumaï : 7 Ma');
  assert.equal(result.data.blocks[0].citations[0].quote,'espèces Toumai Dates 7 Ma.');
  assert.deepEqual(result.usage,{inputTokens:24,outputTokens:16});
  assert.doesNotMatch(JSON.stringify(result.data),/slotId|requiredTerms|requiredValue|expected/);
});

for(const [name,mutate,code] of [
  ['omission',raw=>({blocks:raw.blocks.slice(1)}),'INVALID_STRUCTURE'],
  ['doublon',raw=>({blocks:[raw.blocks[0],raw.blocks[0],raw.blocks[2]]}),'INVALID_STRUCTURE'],
  ['identifiant étranger',raw=>{raw.blocks[0].slotId='foreign';return raw;},'UNKNOWN_CITATION'],
  ['preuve étrangère',raw=>{raw.blocks[0].segmentIds=['foreign'];return raw;},'UNKNOWN_CITATION'],
  ['preuve remplacée',raw=>{raw.blocks[0].segmentIds=raw.blocks[1].segmentIds;return raw;},'UNKNOWN_CITATION'],
  ['nom omis',raw=>{raw.blocks[0].title='Repère ancien';raw.blocks[0].text='Le repère date de 7 Ma.';return raw;},'INVALID_STRUCTURE'],
  ['unité modifiée',raw=>{raw.blocks[0].title='Toumai';raw.blocks[0].text='Toumai date de 7 Ga.';return raw;},'UNVERIFIABLE_NUMBER'],
  ['nombre modifié',raw=>{raw.blocks[0].title='Toumai';raw.blocks[0].text='Toumai date de 8 Ma.';return raw;},'UNVERIFIABLE_NUMBER'],
])test(`contrat des emplacements : ${name} refusé sans relance`,async t=>{
  const calls=provider(t,mutate);
  await assert.rejects(generateCourse(input()),{code});assert.equal(calls(),1);
});

test('audit défavorable à l’ancre : aucune production partielle publiée, aucune relance',async t=>{
  const calls=provider(t,raw=>raw,true);
  await assert.rejects(generateCourse(input()),{code:'AUDIT_REJECTED'});assert.equal(calls(),2);
});

test('emplacements propres au cours/compte, instantané vérifié uniquement',()=>{
  const a=essentialPlan([passage('Toumai 7 Ma','account-a-course-a')]);
  const b=essentialPlan([passage('Toumai 7 Ma','account-b-course-b')]);
  assert.notEqual(a.slots[0].id,b.slots[0].id);
  assert.throws(()=>a.resolve({slotId:b.slots[0].id,title:'Toumai',text:'Toumai 7 Ma',kind:'explanation',segmentIds:[b.slots[0].segmentId]}),{code:'UNKNOWN_CITATION'});
  assert.equal(essentialPlan([{...passage(flattened),quality:'needs-vision'}]).slots.length,0);
});
