import type { PrismaClient } from '@prisma/client';
import { gradeQuestion, insufficient, learningSchema } from './learning-contract.ts';

export async function ownedSession(db:PrismaClient,userId:string,id:string) {
  const session=await db.learningSession.findFirst({where:{id,userId},include:{projectVersion:true,attempts:{orderBy:{createdAt:'asc'}}}});
  if(!session)throw new Error('Activité introuvable.');
  return session;
}

export async function answerSession(db:PrismaClient,userId:string,id:string,position:number,answer:string) {
  const session=await ownedSession(db,userId,id);
  if(position!==session.position || !answer.trim() || answer.length>3000)throw new Error('Réponse invalide ou question déjà passée.');
  const output=learningSchema.parse(session.projectVersion.content);
  const q=output.questions[position];
  let correct:boolean|null=null;let feedback=insufficient;
  if(session.kind==='revision') {if(!q)throw new Error('Question introuvable.');correct=gradeQuestion(q,answer);feedback=q.explanation;}
  else {
    const h=output.homework;if(!h)throw new Error('Devoir introuvable.');
    const found=h.keywords.filter(k=>answer.toLocaleLowerCase('fr').includes(k.toLocaleLowerCase('fr')));
    feedback=found.length?`Tu as utilisé ${found.length} repère${found.length>1?'s':''} du cours. Vérifie maintenant le lien avec la consigne : ${h.check}`:`Cherche le premier repère dans le passage indiqué, puis complète ta réponse. ${h.check}`;
  }
  return db.learningAttempt.create({data:{userId,sessionId:id,questionIndex:position,answer,feedback,correct,hintsUsed:session.kind==='homework'?Math.min(session.position+1,2):0}});
}

export async function advanceSession(db:PrismaClient,userId:string,id:string) {
  const s=await ownedSession(db,userId,id);
  if(!s.attempts.some(a=>a.questionIndex===s.position))throw new Error('Réponds d’abord à cette question.');
  const output=learningSchema.parse(s.projectVersion.content);
  const maximum=s.kind==='revision'?output.questions.length:1;
  if(s.position>=maximum)return;
  await db.learningSession.updateMany({where:{id,userId,position:s.position},data:{position:{increment:1}}});
}

export async function requestCorrection(db:PrismaClient,userId:string,id:string) {
  const s=await ownedSession(db,userId,id);
  if(s.kind!=='homework')throw new Error('Devoir introuvable.');
  if(!s.attempts.length)throw new Error('Écris d’abord une tentative avant de voir la correction.');
  await db.learningSession.updateMany({where:{id,userId},data:{correctionRequested:true}});
}
