import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateActivity } from '../lib/courses/activity-contract.ts';
import { generateCourse } from '../lib/providers/llm/course-provider.ts';

const passages=Array.from({length:6},(_,index)=>({id:`p${index}`,quality:'verified',label:`Page ${index+1}`,method:'native',text:`Repère ${index+1} : la valeur ${index+1} Ma est indiquée dans le cours.`}));
const block=index=>({title:`Repère ${index+1}`,text:`La valeur ${index+1} Ma est indiquée dans le cours.`,kind:'explanation',citations:[{passageId:`p${index}`,quote:passages[index].text}]});

test('fiche mémo : éléments courts, titres utiles, citations exactes et aucune preuve étrangère',()=>{
  const output=validateActivity({blocks:passages.map((_,index)=>block(index))},passages,'memo');
  assert.equal(output.title,'Ta fiche mémo');assert.equal(output.blocks.length,6);
  assert.deepEqual(output.blocks.map(item=>item.title),passages.map((_,index)=>`Repère ${index+1}`));
  const foreign=structuredClone(block(0));foreign.citations[0].passageId='other';
  assert.throws(()=>validateActivity({blocks:[foreign]},passages,'memo'),{code:'NO_USABLE_BLOCKS'});
});

test('fiche mémo : mock local, aucune requête provider et huit éléments au plus',async()=>{
  const before=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network');};
  const prior=process.env.LLM_PROVIDER;process.env.LLM_PROVIDER='mock';
  try {const result=await generateCourse({mode:'memo',minutes:5,passages});assert.ok(result.data.blocks.length<=8);assert.ok(result.data.blocks.every(item=>item.title&&item.citations.length));assert.equal(calls,0);}
  finally {globalThis.fetch=before;if(prior===undefined)delete process.env.LLM_PROVIDER;else process.env.LLM_PROVIDER=prior;}
});

test('fiche mémo : parcours mobile garde le format et les liens vers le cours',async()=>{
  const page=await readFile(new URL('../app/courses/[id]/revise/page.tsx',import.meta.url),'utf8');
  const content=await readFile(new URL('../app/courses/[id]/content/[versionId]/page.tsx',import.meta.url),'utf8');
  assert.match(page,/Fiche mémo/);assert.match(page,/min-h/);
  assert.match(content,/memo/);assert.match(content,/LearningBlocks/);
});
