import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateActivity } from '../lib/courses/activity-contract.ts';
import { generateCourse, OUTPUT_LIMITS } from '../lib/providers/llm/course-provider.ts';

const passages=Array.from({length:7},(_,index)=>({id:`p${index}`,quality:'verified',label:`Page ${index+1}`,method:'native',text:`Notion ${index+1} : le cours indique ${index+1} Ma.`}));
const card=index=>({title:`Question ${index+1}`,text:`Le cours indique ${index+1} Ma.`,kind:'explanation',citations:[{passageId:`p${index}`,quote:passages[index].text}]});

test('flashcards : réponses, preuves exactes et propriétaire restent limités au cours',()=>{
  const output=validateActivity({blocks:passages.map((_,index)=>card(index))},passages,'flashcards');
  assert.equal(output.title,'Tes flashcards');assert.equal(output.blocks.length,7);
  const foreign={...card(0),citations:[{passageId:'foreign',quote:passages[0].text}]};
  assert.throws(()=>validateActivity({blocks:[foreign]},passages,'flashcards'),{code:'NO_USABLE_BLOCKS'});
});

test('flashcards : mock local, plafond documenté et aucune requête provider',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network');};
  const prior=process.env.LLM_PROVIDER;process.env.LLM_PROVIDER='mock';
  try {const result=await generateCourse({mode:'flashcards',minutes:5,passages});assert.ok(result.data.blocks.length<=10);assert.ok(result.data.blocks.every(item=>item.title&&item.citations.length));assert.equal(OUTPUT_LIMITS.flashcards,2200);assert.equal(calls,0);}
  finally {globalThis.fetch=original;if(prior===undefined)delete process.env.LLM_PROVIDER;else process.env.LLM_PROVIDER=prior;}
});

test('flashcards : interaction accessible au clavier et utilisable sur petit écran',async()=>{
  const component=await readFile(new URL('../components/flashcard-deck.tsx',import.meta.url),'utf8');
  const page=await readFile(new URL('../app/courses/[id]/flashcards/[versionId]/page.tsx',import.meta.url),'utf8');
  assert.match(component,/ArrowLeft/);assert.match(component,/ArrowRight/);assert.match(component,/aria-pressed/);assert.match(component,/min-h-64/);assert.match(component,/Voir dans mon cours/);
  assert.match(page,/user\.id/);assert.match(page,/mode:'flashcards'/);
});
