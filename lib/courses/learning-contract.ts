import { z } from 'zod';
export const citationSchema = z.object({passageId:z.string().min(1),quote:z.string().min(1).max(2000)}).strict();
const refs = z.array(citationSchema).min(1).max(8);
export const block = z.object({title:z.string().min(1).max(60).optional(),text:z.string().min(1).max(1200),kind:z.enum(['explanation','example']),citations:refs}).strict();
export const question = z.object({
  type:z.enum(['mcq','boolean','gap','order','association']),
  prompt:z.string().min(1).max(600),choices:z.array(z.string().max(300)).max(8),
  expected:z.array(z.string().min(1).max(300)).min(1).max(8),
  variants:z.array(z.string().min(1).max(300)).max(10),
  explanation:z.string().min(1).max(700),difficulty:z.enum(['easy','medium']),citations:refs,
}).strict();
export const visual = z.object({
  type:z.enum(['timeline','concepts','steps','comparison','mindmap']),
  title:z.string().max(120),items:z.array(z.object({label:z.string().min(1).max(160),detail:z.string().max(300),parent:z.number().int().min(-1).max(30),citations:refs}).strict()).min(2).max(31),
}).strict();
export const learningSchema = z.object({
  title:z.string().min(1).max(160),blocks:z.array(block).min(1).max(8),
  questions:z.array(question).max(12),visual:visual.nullable(),
  homework:z.object({rephrased:z.string().min(1).max(600),check:z.string().min(1).max(400),hints:z.array(block).length(2),correction:z.array(block).min(1).max(5),keywords:z.array(z.string().min(1).max(120)).min(1).max(8),citations:refs}).strict().nullable(),
  elementsOmitted:z.boolean().optional(),
}).strict();
export type LearningOutput = z.infer<typeof learningSchema>;
export type Question = LearningOutput['questions'][number];
export type Passage = {id:string;text:string;quality:string;label:string;method:string};
export const MODES = ['explain','summary','essential','memo','flashcards','mindmap','visual','quiz','gap','order','mix','homework'] as const;
export type LearningMode = typeof MODES[number];
export const normalizeAnswer = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/−/g,'-').replace(/[^a-z0-9+*/=<>^%,.\-]+/g,' ').replace(/[. ]+$/g,'').trim();
export const insufficient = 'Je ne peux pas le vérifier avec ce cours.';

// validateGroundedOutput moved to ./learning-validation.ts
export { validateGroundedOutput } from './learning-validation.ts';

export function gradeQuestion(q:Question, answer:string):boolean {
  const actual=answer.split('\n').map(normalizeAnswer);
  if(q.type==='order') return actual.join('|')===q.expected.map(normalizeAnswer).join('|');
  if(q.type==='association') return actual.slice().sort().join('|')===q.expected.map(normalizeAnswer).sort().join('|');
  return [...q.expected,...q.variants].some(v=>normalizeAnswer(v)===normalizeAnswer(answer));
}

export function publicQuestion(q:Question) {
  return {type:q.type,prompt:q.prompt,choices:q.choices,difficulty:q.difficulty};
}
