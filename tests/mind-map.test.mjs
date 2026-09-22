import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateActivity } from '../lib/courses/activity-contract.ts';
import { generateCourse, OUTPUT_LIMITS } from '../lib/providers/llm/course-provider.ts';

const passages=Array.from({length:7},(_,index)=>({id:`p${index}`,quality:'verified',label:`Page ${index+1}`,method:'native',text:`Repère ${index+1} : ${index+1} Ma dans le cours.`}));
const item=(index,parent)=>({label:passages[index].text,detail:'',parent,citations:[{passageId:passages[index].id,quote:passages[index].text}]});
const map=()=>({visual:{type:'mindmap',title:'Carte',items:[item(0,-1),item(1,0),item(2,0),item(3,0),item(4,1),item(5,2),item(6,3)]}});

test('carte mentale : sujet, trois branches et preuves serveur exactes',()=>{
  const output=validateActivity(map(),passages,'mindmap');assert.equal(output.title,'Ta carte mentale');assert.equal(output.visual?.type,'mindmap');
  const central=output.visual.items.findIndex(item=>item.parent===-1);const branches=output.visual.items.filter(item=>item.parent===central);
  assert.equal(branches.length,3);assert.ok(branches.every(branch=>output.visual.items.some(item=>item.parent===output.visual.items.indexOf(branch))));
  assert.throws(()=>validateActivity({visual:{...map().visual,items:[...map().visual.items.slice(0,6),{...item(6,3),citations:[{passageId:'other',quote:passages[6].text}]}]}},passages,'mindmap'),{code:'INVALID_STRUCTURE'});
});

test('carte mentale : nombres, unités et hiérarchie ne peuvent pas être inventés ou répétés',()=>{
  const invalid=map();invalid.visual.items[4]={...invalid.visual.items[4],label:'Repère 99 : 99 Ma dans le cours.'};
  assert.throws(()=>validateActivity(invalid,passages,'mindmap'),{code:'INVALID_STRUCTURE'});
  const duplicate=map();duplicate.visual.items[6]={...duplicate.visual.items[6],label:duplicate.visual.items[5].label};
  assert.throws(()=>validateActivity(duplicate,passages,'mindmap'),{code:'INVALID_STRUCTURE'});
});

test('carte mentale : mock sans provider, mobile et accessible',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network');};const prior=process.env.LLM_PROVIDER;process.env.LLM_PROVIDER='mock';
  try {const result=await generateCourse({mode:'mindmap',minutes:5,passages});assert.equal(result.data.visual?.type,'mindmap');assert.equal(OUTPUT_LIMITS.mindmap,2600);assert.equal(calls,0);}
  finally {globalThis.fetch=original;if(prior===undefined)delete process.env.LLM_PROVIDER;else process.env.LLM_PROVIDER=prior;}
  const component=await readFile(new URL('../components/mind-map.tsx',import.meta.url),'utf8');const page=await readFile(new URL('../app/courses/[id]/mind-map/[versionId]/page.tsx',import.meta.url),'utf8');
  assert.match(component,/aria-label="Carte mentale"/);assert.match(component,/sm:grid-cols-2/);assert.match(component,/Version structurée/);assert.match(component,/SourceRefs/);assert.match(page,/user\.id/);assert.match(page,/mode:'mindmap'/);
});
