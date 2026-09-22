import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { quizContext, quizSchema, validateQuizChoices, assertQuizAudit } from '../lib/courses/quiz-contract.ts';
import { failureDiagnostics, QUIZ_REJECTED_PRODUCTION_MESSAGE, rejectedProductionMessage } from '../lib/courses/learning-errors.ts';
import { validateActivity } from '../lib/courses/activity-contract.ts';
import { gradeQuestion, publicQuestion } from '../lib/courses/learning-contract.ts';
import { generateCourse, conciseOptions } from '../lib/providers/llm/course-provider.ts';
import { quizFixture } from './helpers/quiz-fixtures.mjs';

const wire=(data)=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:30,output_tokens:40}});
function fakeProvider(t,callback) {
  const old={};for(const key of ['LLM_PROVIDER','LLM_API_KEY','LLM_MODEL'])old[key]=process.env[key];
  Object.assign(process.env,{LLM_PROVIDER:'openai',LLM_API_KEY:'synthetic-never-sent',LLM_MODEL:'gpt-5-mini'});
  t.after(()=>{for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  t.mock.method(globalThis,'fetch',callback);
}

for(const [subject,profile] of [['Histoire-géographie','history-geography'],['Mathématiques','mathematics'],['Français','language']])test(`QCM ${subject} : quatre questions, une bonne réponse, citations exactes et deux appels concis`,async t=>{
  const f=quizFixture(subject);let calls=0,signal;const budgets=[];
  const actualTimeout=AbortSignal.timeout;
  t.mock.method(AbortSignal,'timeout',ms=>{budgets.push(ms);return actualTimeout(ms);});
  fakeProvider(t,async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');calls++;const request=JSON.parse(options.body),input=JSON.parse(request.input);
    assert.equal(request.store,false);assert.equal('tools' in request,false);assert.deepEqual(request.reasoning,{effort:'low'});assert.equal(request.text.verbosity,'low');
    assert.equal(input.subjectProfile,profile);
    if(calls===1) {
      signal=options.signal;assert.equal(request.max_output_tokens,2400);assert.equal(input.questionCount,4);
      assert.deepEqual(Object.keys(request.text.format.schema.properties),['questions']);
      assert.deepEqual(Object.keys(request.text.format.schema.properties.questions.items.properties),['prompt','choices','correctChoiceId','explanation','segmentIds']);
      assert.equal('passages' in input,false);assert.ok(input.segments.every(s=>['course','answer'].includes(s.category)));
      return wire(f.raw);
    }
    assert.equal(calls,2);assert.equal(options.signal,signal);assert.equal(request.max_output_tokens,1200);
    assert.equal('blocks' in input,false);assert.equal(input.questions.length,4);
    assert.match(request.instructions,/distracteurs.*hypothèses/i);assert.match(request.instructions,/plausible=true/);
    return wire(f.audit);
  });
  const result=await generateCourse(f.input);
  assert.equal(calls,2);assert.deepEqual(budgets,[120000]);assert.deepEqual(result.usage,{inputTokens:60,outputTokens:80});
  assert.equal(result.data.questions.length,4);
  for(const q of result.data.questions) {
    assert.equal(q.type,'mcq');assert.equal(q.choices.filter(c=>gradeQuestion(q,c)).length,1);
    assert.equal(q.choices.filter(c=>c===q.expected[0]).length,1);
    for(const ref of q.citations)assert.equal(f.passages.find(p=>p.id===ref.passageId).text,ref.quote);
    assert.deepEqual(Object.keys(publicQuestion(q)),['type','prompt','choices','difficulty']);
  }
  assert.deepEqual(conciseOptions('unlisted-model',true),{});
});

test('contrat minimal : nombre exact, IDs uniques, doublons et réponses trop longues refusés',()=>{
  const f=quizFixture();assert.equal(quizSchema(5).safeParse(f.raw).success,true);
  assert.equal(quizSchema(5).safeParse({questions:f.raw.questions.slice(0,3)}).success,false);
  assert.equal(quizSchema(10).safeParse(f.raw).success,false);
  for(const mutate of [r=>r.questions[0].choices[1].id='a',r=>r.questions[0].correctChoiceId='unknown',r=>r.questions[1].prompt=r.questions[0].prompt,r=>r.questions[0].choices[1].text=r.questions[0].choices[0].text,r=>r.questions[0].choices[1].text='Une réponse démesurément longue qui contient de nombreuses explications absentes des autres options.']) {
    const raw=structuredClone(f.raw);mutate(raw);assert.throws(()=>f.plan.resolve(raw));
  }
  const questions=f.plan.resolve(f.raw).questions;
  const biased=questions.map((q,i)=>({...q,choices:['réponse A','réponse B','bonne réponse'],expected:['bonne réponse'],prompt:`Question ${i}`}));
  assert.throws(()=>validateQuizChoices(biased),{code:'QUIZ_CORRECT_CHOICE_BIAS'});
});

test('géographie : continents et échelles incohérentes refusés pour une région d’Afrique',()=>{
  const f=quizFixture();
  for(const wrong of ['Asie','Europe','France','Afrique']) {
    const raw=structuredClone(f.raw);raw.questions[0].choices[1].text=wrong;
    assert.throws(()=>f.plan.resolve(raw),{code:'QUIZ_CHOICE_LENGTH_MISMATCH'});
  }
});

test('QCM mathématiques : nombres en fin de phrase conservés, listes et questions toujours séparées',()=>{
  const f=quizFixture('Mathématiques');
  const text=f.passages.map(p=>p.text).join(' ');
  const context=quizContext([{...f.passages[0],text}],5).context;
  for(const p of f.passages)assert.ok(context.segments.some(s=>s.text===p.text),p.text);
  for(const s of context.segments)assert.ok(text.includes(s.text));
  const list=quizContext([{...f.passages[0],text:'1. Le triangle possède 3 côtés.\n2. Le carré possède 4 côtés.\n3. Quelle figure possède 5 côtés ?'}],5).context;
  assert.ok(list.segments.some(s=>s.text==='Le triangle possède 3 côtés.'));
  assert.ok(list.segments.some(s=>s.text==='2. Le carré possède 4 côtés.'));
  assert.ok(list.segments.every(s=>!s.text.includes('5 côtés')));
});

test('distracteurs numériques : fausses valeurs autorisées, bonne valeur et unités strictes',()=>{
  const f=quizFixture('Mathématiques');assert.doesNotThrow(()=>validateActivity(f.plan.resolve(f.raw),f.passages,'quiz'));
  const wrongUnit=structuredClone(f.raw);wrongUnit.questions[0].choices[1].text='10 kg';assert.throws(()=>f.plan.resolve(wrongUnit));
  const squared=structuredClone(f.raw);squared.questions[0].choices[1].text='10 cm²';assert.throws(()=>f.plan.resolve(squared));
  const equivalent=structuredClone(f.raw);equivalent.questions[0].choices[1].text='12,0 cm';assert.throws(()=>f.plan.resolve(equivalent));
  const wrongAnswer=structuredClone(f.raw);wrongAnswer.questions[0].choices[0].text='13 cm';assert.throws(()=>validateActivity(f.plan.resolve(wrongAnswer),f.passages,'quiz'),{code:'UNVERIFIABLE_NUMBER'});
  const badExplanation=structuredClone(f.raw);badExplanation.questions[0].explanation='Le périmètre vaut 99 cm.';assert.throws(()=>validateActivity(f.plan.resolve(badExplanation),f.passages,'quiz'),{code:'UNVERIFIABLE_NUMBER'});
});

test('questions sans réponse, preuves incertaines, étrangères ou citations fournies par le modèle refusées',()=>{
  const f=quizFixture();
  assert.throws(()=>quizContext([{...f.passages[0],text:'Quand la cité a-t-elle été fondée ?'}],5),{code:'SOURCE_UNUSABLE'});
  assert.throws(()=>quizContext(f.passages.map(p=>({...p,quality:'uncertain'})),5),{code:'SOURCE_UNUSABLE'});
  const foreign=quizContext(f.passages.map(p=>({...p,id:'other-account-'+p.id})),5);
  assert.throws(()=>foreign.resolve(f.raw),{code:'QUIZ_EVIDENCE_INVALID'});
  const quote=structuredClone(f.raw);quote.questions[0].citations=[{passageId:'invented',quote:'invented'}];assert.throws(()=>f.plan.resolve(quote));
});

test('audit : ambiguïté, distracteur absurde, fait non étayé ou index manquant bloquent la publication sans relance',async t=>{
  for(const field of ['supported','unambiguous','plausible','duplicate'])await t.test(field,async t=>{
    const f=quizFixture();const bad=structuredClone(f.audit);
    if(field==='duplicate')bad.decisions[1].index=0;else bad.decisions[2][field]=false;
    assert.throws(()=>assertQuizAudit(bad,4),{code:'QUIZ_AUDIT_REJECTED'});
    let calls=0;fakeProvider(t,async()=>wire(++calls===1?f.raw:bad));
    await assert.rejects(generateCourse(f.input),{code:'QUIZ_AUDIT_REJECTED'});assert.equal(calls,2);
  });
});

test('diagnostics QCM : chaque famille garde une catégorie publique et ne conserve que des métriques bornées',()=>{
  const f=quizFixture();const maths=quizFixture('Mathématiques');
  const cases=[
    [raw=>{raw.questions.pop();},'QUIZ_QUESTION_COUNT_INVALID'],
    [raw=>{raw.questions[0].choices[1].id='a';},'QUIZ_CHOICE_ID_DUPLICATE'],
    [raw=>{raw.questions[0].choices[1].text=raw.questions[0].choices[0].text;},'QUIZ_CHOICE_DUPLICATE'],
    [raw=>{raw.questions[0].choices[1].text='10 kg';},'QUIZ_NUMERIC_UNIT_INVALID',maths],
  ];
  for(const [mutate,code,fixture=f] of cases) {
    const raw=structuredClone(fixture.raw);mutate(raw);let error;
    try {fixture.plan.resolve(raw);}catch(value){error=value;}
    assert.equal(error?.code,code);const metadata=failureDiagnostics(error);
    assert.equal(metadata.failurePhase==='contract-resolution'||metadata.failurePhase==='deterministic-validation',true);
    assert.equal(JSON.stringify(metadata).includes('synthetic'),false);
    assert.ok(Number.isSafeInteger(metadata.questionOrdinal??0)||code==='QUIZ_QUESTION_COUNT_INVALID');
  }
  assert.equal(rejectedProductionMessage('quiz'),QUIZ_REJECTED_PRODUCTION_MESSAGE);
  assert.match(rejectedProductionMessage('explain'),/explication/i);
});

test('QCM : budget global couvre les deux appels et leurs corps, sans troisième requête',async t=>{
  for(const phase of ['generation','generation-body','audit','audit-body'])await t.test(phase,async t=>{
    const f=quizFixture(),controller=new AbortController();let calls=0,ready;const reached=new Promise(r=>{ready=r;});
    t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,120000);return controller.signal;});
    fakeProvider(t,async(_url,options)=>{
      calls++;assert.equal(options.signal,controller.signal);const current=calls===1?'generation':'audit';
      if(phase===current){ready();return new Promise(()=>{});}
      if(phase===current+'-body')return {ok:true,json:()=>{ready();return new Promise(()=>{});}};
      return wire(calls===1?f.raw:f.audit);
    });
    const pending=generateCourse(f.input);await reached;controller.abort(new DOMException('synthetic timeout','TimeoutError'));
    await assert.rejects(pending,{code:'TIMEOUT'});assert.equal(calls,phase.startsWith('generation')?1:2);
  });
});

test('retour serveur sans répétition de la réponse correcte et cache QCM distinct',async()=>{
  const page=await readFile(new URL('../app/courses/[id]/session/[sessionId]/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(page,/Ta réponse :/);assert.match(page,/!last.correct\?<p>Réponse attendue/);assert.match(page,/Bien joué !/);assert.match(page,/aria-live="polite"/);assert.match(page,/Question suivante/);
  const service=await readFile(new URL('../lib/courses/learning-service.ts',import.meta.url),'utf8');assert.match(service,/mode==='quiz'\?QUIZ_VERSION/);
});
