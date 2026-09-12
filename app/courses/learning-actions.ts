"use server";
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { MODES, type LearningMode } from '@/lib/courses/learning-contract';
import { advanceSession, analyzeCourse, answerSession, COURSE_READING_REQUIRED, prepareAudio, prepareLearning, requestCorrection, reviewExtraction } from '@/lib/courses/learning-service';
import { LLM_TIMEOUT_MESSAGE } from '@/lib/providers/llm/course-provider';
import { createLearningTrace } from '@/lib/courses/learning-trace';
import { learningErrorCategory } from '@/lib/courses/learning-errors';
const field=(f:FormData,k:string)=>typeof f.get(k)==='string'?String(f.get(k)):'';
const coursePath=(id:string)=>`/courses/${encodeURIComponent(id)}`;
function code(error:unknown) {
  const message=error instanceof Error?error.message:'';
  if(message===LLM_TIMEOUT_MESSAGE)return 'timeout';
  if(message===COURSE_READING_REQUIRED)return 'reading';
  return learningErrorCategory(error);
}
export async function analyzeLearningCourse(form:FormData) {
  const user=await requireCurrentUser();const id=field(form,'courseId');
  const consent=form.get('consent')==='yes';
  const ids=consent?form.getAll('page').filter((v):v is string=>typeof v==='string'):[];
  if(!consent||!ids.length)redirect(`${coursePath(id)}?readingError=consent#course-reading`);
  try {await analyzeCourse(prisma,user.id,id,ids);}catch(error){redirect(`${coursePath(id)}?readingError=${code(error)}#course-reading`);}
  revalidatePath(coursePath(id));redirect(coursePath(id));
}
export async function startCourseLearning(form:FormData) {
  const trace=createLearningTrace();trace.event('action-start');
  const user=await requireCurrentUser();const id=field(form,'courseId');const mode=field(form,'mode');
  if(!MODES.includes(mode as LearningMode))redirect(coursePath(id));
  trace.activity?.(mode as LearningMode);
  const minutes=form.get('minutes')==='10'?10:5;
  const path=mode==='homework'?'homework':['quiz','gap','order','mix'].includes(mode)?'revise':'understand';
  let result;
  try {result=await prepareLearning(prisma,user.id,id,mode as LearningMode,minutes,field(form,'instruction'),trace);}
  catch(error){trace.failed(error);revalidatePath(coursePath(id));redirect(`${coursePath(id)}/${path}?error=${code(error)}${path==='revise'?`&minutes=${minutes}`:''}`);}
  trace.event('done');
  revalidatePath(coursePath(id));
  redirect(result.sessionId?`${coursePath(id)}/session/${result.sessionId}`:`${coursePath(id)}/content/${result.versionId}`);
}
export async function submitLearningAnswer(form:FormData) {
  const user=await requireCurrentUser();const courseId=field(form,'courseId');const sessionId=field(form,'sessionId');
  const values=form.getAll('answer').filter((v):v is string=>typeof v==='string');
  const answer=values.join('\n');
  const url=`${coursePath(courseId)}/session/${encodeURIComponent(sessionId)}`;
  try {await answerSession(prisma,user.id,sessionId,Number(field(form,'position')),answer);}catch(error){redirect(`${url}?error=${code(error)}`);}
  revalidatePath(url);redirect(url);
}
export async function nextLearningStep(form:FormData) {
  const user=await requireCurrentUser();const courseId=field(form,'courseId');const id=field(form,'sessionId');const url=`${coursePath(courseId)}/session/${encodeURIComponent(id)}`;
  try {await advanceSession(prisma,user.id,id);}catch(error){redirect(`${url}?error=${code(error)}`);}
  revalidatePath(url);redirect(url);
}
export async function showHomeworkCorrection(form:FormData) {
  const user=await requireCurrentUser();const courseId=field(form,'courseId');const id=field(form,'sessionId');
  await requestCorrection(prisma,user.id,id);
  const url=`${coursePath(courseId)}/session/${encodeURIComponent(id)}`;revalidatePath(url);redirect(url);
}
export async function confirmCourseReading(form:FormData) {
  const user=await requireCurrentUser();const id=field(form,'courseId');
  if(form.get('confirmed')!=='yes')redirect(coursePath(id));
  try {await reviewExtraction(prisma,user.id,id,field(form,'extractionId'),field(form,'text'));}catch(error){redirect(`${coursePath(id)}/reading/${encodeURIComponent(field(form,'extractionId'))}?error=${code(error)}`);}
  revalidatePath(coursePath(id));redirect(coursePath(id));
}
export async function createLearningAudio(form:FormData) {
  const user=await requireCurrentUser();const courseId=field(form,'courseId');const versionId=field(form,'versionId');const sessionId=field(form,'sessionId');
  const url=sessionId?`${coursePath(courseId)}/session/${encodeURIComponent(sessionId)}`:`${coursePath(courseId)}/content/${encodeURIComponent(versionId)}`;
  try {await prepareAudio(prisma,user.id,versionId,field(form,'audioKey'),sessionId||undefined);}catch(error){redirect(`${url}?error=${code(error)}`);}
  revalidatePath(url);redirect(url);
}
